import { describe, expect, test } from "bun:test";
import {
  bumpPatchVersion,
  collectAffectedWorkspaces,
  hasMeaningfulManifestDiff,
  type WorkspaceInfo,
} from "./autobump-workspaces";

describe("bumpPatchVersion", () => {
  test("increments the patch component of a semver version", () => {
    expect(bumpPatchVersion("1.2.3")).toBe("1.2.4");
  });
});

describe("hasMeaningfulManifestDiff", () => {
  test("ignores version-only package.json diffs", () => {
    expect(
      hasMeaningfulManifestDiff(
        [
          "diff --git a/apps/web/package.json b/apps/web/package.json",
          "@@ -2 +2 @@",
          '-  "version": "0.0.1",',
          '+  "version": "0.0.2",',
        ].join("\n"),
        "package-json"
      )
    ).toBe(false);
  });

  test("ignores version-only mix.exs diffs", () => {
    expect(
      hasMeaningfulManifestDiff(
        [
          "diff --git a/apps/collab/mix.exs b/apps/collab/mix.exs",
          "@@ -6 +6 @@",
          '-      version: "0.1.0",',
          '+      version: "0.1.1",',
        ].join("\n"),
        "mix-exs"
      )
    ).toBe(false);
  });

  test("treats dependency changes as meaningful", () => {
    expect(
      hasMeaningfulManifestDiff(
        [
          "diff --git a/apps/web/package.json b/apps/web/package.json",
          "@@ -15 +15 @@",
          '-    "posthog-js": "^1.298.1",',
          '+    "posthog-js": "^1.299.0",',
        ].join("\n"),
        "package-json"
      )
    ).toBe(true);
  });
});

describe("collectAffectedWorkspaces", () => {
  const workspaces: WorkspaceInfo[] = [
    {
      manifestPath: "apps/web/package.json",
      mixPath: null,
      rootDir: "apps/web",
      version: "0.0.1",
    },
    {
      manifestPath: "apps/collab/package.json",
      mixPath: "apps/collab/mix.exs",
      rootDir: "apps/collab",
      version: "0.1.0",
    },
  ];

  test("bumps workspaces with real staged changes", () => {
    const affected = collectAffectedWorkspaces(
      workspaces,
      ["apps/web/src/app/layout.tsx", "apps/collab/mix.exs"],
      {
        "apps/collab/mix.exs": [
          "diff --git a/apps/collab/mix.exs b/apps/collab/mix.exs",
          "@@ -6 +6 @@",
          '-      version: "0.1.0",',
          '+      version: "0.1.1",',
        ].join("\n"),
      }
    );

    expect(affected.map((workspace) => workspace.rootDir)).toEqual([
      "apps/web",
    ]);
  });
});
