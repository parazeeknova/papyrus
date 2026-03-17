import { afterAll, beforeAll } from "bun:test";
import { type Subprocess, spawn } from "bun";

// ANSI color codes for pretty CLI output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

const icons = {
  rocket: ">>",
  check: "[OK]",
  cross: "[X]",
  search: "[*]",
  timer: "[~]",
  sparkles: "[*]",
  warning: "[!]",
  info: "[i]",
};

const TEST_ENV = {
  MIX_ENV: "test",
  PHX_SERVER: "true",
  PORT: "4001",
  E2E_AUTH_ENABLED: "true",
};

const SERVER_PORT = 4001;
const HEALTH_CHECK_URL = `http://127.0.0.1:${SERVER_PORT}/api/health`;
const HEALTH_CHECK_TIMEOUT = 60_000;
const HEALTH_CHECK_INTERVAL = 500;

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function log(message: string): void {
  console.log(`${colors.cyan}${icons.info}${colors.reset} ${message}`);
}

function logSuccess(message: string): void {
  console.log(`${colors.green}${icons.check}${colors.reset} ${message}`);
}

function logWarning(message: string): void {
  console.log(`${colors.yellow}${icons.warning}${colors.reset} ${message}`);
}

function logError(message: string): void {
  console.log(`${colors.red}${icons.cross}${colors.reset} ${message}`);
}

function logStep(step: string, detail?: string): void {
  const detailText = detail ? `${colors.dim} ${detail}${colors.reset}` : "";
  console.log(
    `${colors.bright}${colors.magenta}${icons.rocket}${colors.reset} ${colors.bright}${step}${colors.reset}${detailText}`
  );
}

async function checkPortInUse(port: number): Promise<boolean> {
  try {
    const proc = spawn({
      cmd: ["lsof", "-i", `:${port}`],
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

async function checkServerHealth(
  url: string,
  timeoutMs: number
): Promise<boolean> {
  try {
    // Use curl to check server - exit code 0 means success
    const proc = spawn({
      cmd: ["curl", "-s", "-o", "/dev/null", url],
      stdout: "ignore",
      stderr: "ignore",
    });

    // Wait for process with timeout
    const timeoutPromise = new Promise<number>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), timeoutMs)
    );

    const exitCode = await Promise.race([proc.exited, timeoutPromise]);
    return exitCode === 0;
  } catch {
    return false;
  }
}

async function waitForServer(
  url: string,
  timeoutMs: number,
  intervalMs: number
): Promise<{ startupTime: number; attempts: number }> {
  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < timeoutMs) {
    attempts++;
    const isHealthy = await checkServerHealth(url, 2000);
    if (isHealthy) {
      return { startupTime: Date.now() - startTime, attempts };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Server failed to start within ${formatDuration(timeoutMs)}`);
}

let collabServer: Subprocess | null = null;
const setupFlag = Symbol.for("papyrus.collab-server-setup");
const globalState = globalThis as typeof globalThis & {
  [setupFlag]?: boolean;
};

if (!globalState[setupFlag]) {
  globalState[setupFlag] = true;

  beforeAll(async () => {
    console.log(); // Empty line for spacing
    logStep(
      "Collab Server Setup",
      `${colors.dim}Initializing test environment...${colors.reset}`
    );
    console.log();

    // Check if server is already running using curl
    log(
      `${icons.search} Checking for existing server on port ${colors.bright}${SERVER_PORT}${colors.reset}...`
    );

    const isServerRunning = await checkServerHealth(HEALTH_CHECK_URL, 2000);

    if (isServerRunning) {
      logSuccess("Existing server found!");
      logSuccess(
        `${colors.green}Reusing existing collab server at port ${SERVER_PORT}${colors.reset}`
      );
      console.log();
      return;
    }

    log(
      `${colors.dim}No existing server detected on port ${SERVER_PORT}${colors.reset}`
    );

    // Check if port is in use by another process
    const portInUse = await checkPortInUse(SERVER_PORT);
    if (portInUse) {
      logWarning(`Port ${SERVER_PORT} is in use by another process`);
      logWarning("Waiting for port to become available...");
      // Wait a bit and check again
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    console.log();
    logStep(
      "Starting Collab Server",
      `${colors.dim}mix phx.server${colors.reset}`
    );
    log(`${colors.dim}Working directory: apps/collab${colors.reset}`);
    log(
      `${colors.dim}Environment: MIX_ENV=test, PORT=${SERVER_PORT}${colors.reset}`
    );
    console.log();

    collabServer = spawn({
      cmd: ["mix", "phx.server"],
      cwd: "./apps/collab",
      env: { ...process.env, ...TEST_ENV },
      stdout: "inherit",
      stderr: "inherit",
    });

    log(`${icons.timer} Waiting for server to be ready...`);
    log(
      `${colors.dim}Health check endpoint: ${HEALTH_CHECK_URL}${colors.reset}`
    );
    log(
      `${colors.dim}Timeout: ${formatDuration(HEALTH_CHECK_TIMEOUT)}${colors.reset}`
    );

    try {
      const { startupTime } = await waitForServer(
        HEALTH_CHECK_URL,
        HEALTH_CHECK_TIMEOUT,
        HEALTH_CHECK_INTERVAL
      );

      console.log();
      logSuccess(
        `${colors.bright}${colors.green}Collab server is ready!${colors.reset} ${colors.dim}(started in ${formatDuration(startupTime)})${colors.reset}`
      );
      logSuccess(
        `${colors.green}Listening on http://127.0.0.1:${SERVER_PORT}${colors.reset}`
      );
      logSuccess(
        `${colors.green}WebSocket available at ws://127.0.0.1:${SERVER_PORT}/ws${colors.reset}`
      );
      console.log();
    } catch (error) {
      console.log();
      logError(
        `${colors.red}Failed to start collab server within ${formatDuration(HEALTH_CHECK_TIMEOUT)}${colors.reset}`
      );
      logError(
        `${colors.red}${error instanceof Error ? error.message : String(error)}${colors.reset}`
      );
      console.log();
      throw error;
    }
  }, 120_000);

  afterAll(async () => {
    if (collabServer) {
      console.log();
      logStep(
        "Collab Server Teardown",
        `${colors.dim}Shutting down...${colors.reset}`
      );

      collabServer.kill();

      // Wait for graceful shutdown
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check if process is still running
      const isStillRunning = await checkServerHealth(HEALTH_CHECK_URL, 1000);
      if (isStillRunning) {
        logWarning("Server may still be running (process didn't exit cleanly)");
      } else {
        logSuccess("Collab server stopped gracefully");
      }

      collabServer = null;
      console.log();
    }
  });
}
