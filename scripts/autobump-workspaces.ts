import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, posix, relative } from "node:path";

export interface WorkspaceInfo {
  manifestPath: string;
  mixPath: string | null;
  rootDir: string;
  version: string | null;
}

export type ManifestKind = "mix-exs" | "package-json";

const GENERATED_DIFF_LINE_PREFIXES = ["@@", "+++", "---", "diff ", "index "];
const PACKAGE_VERSION_PATTERN = /^\s*["']version["']:\s*["'][^"']+["'],?\s*$/;
const MIX_VERSION_PATTERN = /^\s*version:\s*"[^"]+",?\s*$/;
const MIX_VERSION_CAPTURE_PATTERN = /version:\s*"([^"]+)"/;
const MIX_VERSION_REPLACE_PATTERN = /version:\s*"[^"]+"/;
const REPO_ROOT = process.cwd();

function runGitCommand(args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }

  return result.stdout.trim();
}

export function bumpPatchVersion(version: string): string {
  const [major, minor, patch, ...rest] = version.split(".");

  if (!(major && minor && patch) || rest.length > 0) {
    throw new Error(`Unsupported semver version: ${version}`);
  }

  const majorValue = Number.parseInt(major, 10);
  const minorValue = Number.parseInt(minor, 10);
  const patchValue = Number.parseInt(patch, 10);

  if (
    [majorValue, minorValue, patchValue].some((value) => Number.isNaN(value))
  ) {
    throw new Error(`Unsupported semver version: ${version}`);
  }

  return `${majorValue}.${minorValue}.${patchValue + 1}`;
}

export function hasMeaningfulManifestDiff(
  diff: string,
  manifestKind: ManifestKind
): boolean {
  const versionPattern =
    manifestKind === "package-json"
      ? PACKAGE_VERSION_PATTERN
      : MIX_VERSION_PATTERN;

  return diff.split("\n").some((line) => {
    if (
      line.length === 0 ||
      GENERATED_DIFF_LINE_PREFIXES.some((prefix) => line.startsWith(prefix))
    ) {
      return false;
    }

    if (!(line.startsWith("+") || line.startsWith("-"))) {
      return false;
    }

    return !versionPattern.test(line.slice(1));
  });
}

export function collectAffectedWorkspaces(
  workspaces: WorkspaceInfo[],
  stagedFiles: string[],
  stagedDiffs: Record<string, string>
): WorkspaceInfo[] {
  return workspaces.filter((workspace) => {
    return stagedFiles.some((stagedFile) => {
      if (
        !(
          stagedFile === workspace.rootDir ||
          stagedFile.startsWith(`${workspace.rootDir}/`)
        )
      ) {
        return false;
      }

      if (stagedFile === workspace.manifestPath) {
        return hasMeaningfulManifestDiff(
          stagedDiffs[stagedFile] ?? "",
          "package-json"
        );
      }

      if (workspace.mixPath && stagedFile === workspace.mixPath) {
        return hasMeaningfulManifestDiff(
          stagedDiffs[stagedFile] ?? "",
          "mix-exs"
        );
      }

      return true;
    });
  });
}

export function discoverWorkspaces(repoRoot = REPO_ROOT): WorkspaceInfo[] {
  const workspaceDirs = [
    ...listWorkspaceDirs(join(repoRoot, "apps")),
    ...listWorkspaceDirs(join(repoRoot, "packages")),
  ];

  return workspaceDirs.flatMap((workspaceDir) => {
    const manifestPath = join(workspaceDir, "package.json");

    try {
      const packageJson = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        version?: string;
      };
      const mixPath = join(workspaceDir, "mix.exs");

      return [
        {
          manifestPath: relative(repoRoot, manifestPath),
          mixPath: exists(mixPath) ? relative(repoRoot, mixPath) : null,
          rootDir: relative(repoRoot, workspaceDir),
          version: packageJson.version ?? null,
        } satisfies WorkspaceInfo,
      ];
    } catch {
      return [];
    }
  });
}

function listWorkspaceDirs(parentDir: string): string[] {
  if (!exists(parentDir)) {
    return [];
  }

  return readdirSync(parentDir)
    .map((entry) => join(parentDir, entry))
    .filter((entryPath) => statSync(entryPath).isDirectory())
    .filter((entryPath) => exists(join(entryPath, "package.json")));
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function getFallbackVersion(workspace: WorkspaceInfo): string {
  if (workspace.version) {
    return workspace.version;
  }

  if (workspace.mixPath) {
    const mixSource = readFileSync(join(REPO_ROOT, workspace.mixPath), "utf8");
    const match = mixSource.match(MIX_VERSION_CAPTURE_PATTERN);

    if (match?.[1]) {
      return match[1];
    }
  }

  return "0.0.1";
}

function updatePackageManifest(
  workspace: WorkspaceInfo,
  nextVersion: string
): void {
  const manifestFile = join(REPO_ROOT, workspace.manifestPath);
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as {
    version?: string;
    [key: string]: unknown;
  };

  manifest.version = nextVersion;
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
}

function updateMixVersion(workspace: WorkspaceInfo, nextVersion: string): void {
  if (!workspace.mixPath) {
    return;
  }

  const mixFile = join(REPO_ROOT, workspace.mixPath);
  const nextSource = readFileSync(mixFile, "utf8").replace(
    MIX_VERSION_REPLACE_PATTERN,
    `version: "${nextVersion}"`
  );

  writeFileSync(mixFile, nextSource);
}

function stageFiles(paths: string[]): void {
  if (paths.length === 0) {
    return;
  }

  runGitCommand(["add", ...paths]);
}

function collectStagedFiles(): string[] {
  const output = runGitCommand([
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMR",
  ]);

  return output.length === 0
    ? []
    : output.split("\n").map((file) => posix.normalize(file));
}

function collectStagedDiffs(stagedFiles: string[]): Record<string, string> {
  return Object.fromEntries(
    stagedFiles.map((file) => [
      file,
      runGitCommand(["diff", "--cached", "--unified=0", "--", file]),
    ])
  );
}

function main(): void {
  const stagedFiles = collectStagedFiles();
  if (stagedFiles.length === 0) {
    return;
  }

  const workspaces = discoverWorkspaces();
  const affectedWorkspaces = collectAffectedWorkspaces(
    workspaces,
    stagedFiles,
    collectStagedDiffs(stagedFiles)
  );

  if (affectedWorkspaces.length === 0) {
    return;
  }

  for (const workspace of affectedWorkspaces) {
    const nextVersion = bumpPatchVersion(getFallbackVersion(workspace));
    updatePackageManifest(workspace, nextVersion);
    updateMixVersion(workspace, nextVersion);
    stageFiles(
      [workspace.manifestPath, workspace.mixPath].flatMap((path) =>
        path ? [path] : []
      )
    );
  }
}

if (import.meta.main) {
  main();
}
