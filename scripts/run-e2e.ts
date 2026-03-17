#!/usr/bin/env bun
/**
 * E2E test runner with proper port cleanup and logging
 *
 * This script:
 * 1. Checks for existing servers on ports 3001 and 4001
 * 2. Shuts down any existing servers
 * 3. Starts fresh servers with detailed CLI logging
 * 4. Runs Playwright tests
 * 5. Cleans up servers after tests complete
 */

import { type Subprocess, spawn } from "bun";

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
  info: "[i]",
  warning: "[!]",
};

const COLLAB_PORT = 4001;
const WEB_PORT = 3001;
const HEALTH_CHECK_TIMEOUT = 60_000;
const HEALTH_CHECK_INTERVAL = 500;

function log(message: string): void {
  console.log(`${colors.cyan}${icons.info}${colors.reset} ${message}`);
}

function logSuccess(message: string): void {
  console.log(`${colors.green}${icons.check}${colors.reset} ${message}`);
}

function logWarning(message: string): void {
  console.log(`${colors.yellow}${icons.warning}${colors.reset} ${message}`);
}

function logStep(step: string, detail?: string): void {
  const detailText = detail ? `${colors.dim} ${detail}${colors.reset}` : "";
  console.log(
    `${colors.bright}${colors.magenta}${icons.rocket}${colors.reset} ${colors.bright}${step}${colors.reset}${detailText}`
  );
}

async function checkServerHealth(
  url: string,
  timeoutMs: number
): Promise<boolean> {
  try {
    const proc = spawn({
      cmd: ["curl", "-s", "-o", "/dev/null", url],
      stdout: "ignore",
      stderr: "ignore",
    });

    const timeoutPromise = new Promise<number>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), timeoutMs)
    );

    const exitCode = await Promise.race([proc.exited, timeoutPromise]);
    return exitCode === 0;
  } catch {
    return false;
  }
}

async function killProcessOnPort(port: number): Promise<boolean> {
  try {
    const lsofProc = spawn({
      cmd: ["lsof", "-t", "-i", `:${port}`],
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await lsofProc.exited;
    if (exitCode !== 0) {
      return false;
    }

    const pid = await new Response(lsofProc.stdout).text();
    if (!pid.trim()) {
      return false;
    }

    log(`Found process on port ${port}: PID ${pid.trim()}`);

    const killProc = spawn({
      cmd: ["kill", "-9", pid.trim()],
      stdout: "ignore",
      stderr: "ignore",
    });

    await killProc.exited;
    await new Promise((resolve) => setTimeout(resolve, 500));

    const checkProc = spawn({
      cmd: ["lsof", "-i", `:${port}`],
      stdout: "ignore",
      stderr: "ignore",
    });

    const checkExit = await checkProc.exited;
    return checkExit !== 0;
  } catch {
    return false;
  }
}

async function cleanupExistingServers(): Promise<void> {
  console.log();
  logStep("Port Cleanup", "Checking for existing servers...");
  console.log();

  const ports = [
    { port: COLLAB_PORT, name: "Collab" },
    { port: WEB_PORT, name: "Web" },
  ];

  for (const { port, name } of ports) {
    const healthUrl =
      port === COLLAB_PORT
        ? `http://127.0.0.1:${port}/api/health`
        : `http://127.0.0.1:${port}`;

    log(`${icons.search} Checking ${name} server on port ${port}...`);

    const isRunning = await checkServerHealth(healthUrl, 2000);

    if (isRunning) {
      logWarning(`${name} server is running on port ${port}`);
      log(`Stopping ${name} server...`);

      const killed = await killProcessOnPort(port);
      if (killed) {
        logSuccess(`${name} server stopped`);
      } else {
        logWarning(`Could not stop ${name} server gracefully`);
      }
    } else {
      log(`Port ${port} is free`);
    }
  }

  console.log();
  logSuccess("Port cleanup complete");
}

async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const isHealthy = await checkServerHealth(url, 2000);
    if (isHealthy) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL));
  }

  return false;
}

async function startCollabServer(): Promise<Subprocess> {
  console.log();
  logStep("Starting Collab Server", "mix phx.server");
  log(`${colors.dim}Working directory: apps/collab${colors.reset}`);
  log(`${colors.dim}Port: ${COLLAB_PORT}${colors.reset}`);
  log(`${colors.dim}Environment: MIX_ENV=test${colors.reset}`);
  console.log();

  const collabServer = spawn({
    cmd: ["mix", "phx.server"],
    cwd: "./apps/collab",
    env: {
      ...process.env,
      MIX_ENV: "test",
      PORT: String(COLLAB_PORT),
      PHX_SERVER: "true",
      E2E_AUTH_ENABLED: "true",
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  log(`${icons.timer} Waiting for Collab server to be ready...`);

  const healthUrl = `http://127.0.0.1:${COLLAB_PORT}/api/health`;
  const isReady = await waitForServer(healthUrl, HEALTH_CHECK_TIMEOUT);

  if (!isReady) {
    throw new Error(
      `Collab server failed to start within ${HEALTH_CHECK_TIMEOUT}ms`
    );
  }

  console.log();
  logSuccess(
    `${colors.bright}${colors.green}Collab server is ready!${colors.reset}`
  );
  logSuccess(
    `${colors.green}Listening on http://127.0.0.1:${COLLAB_PORT}${colors.reset}`
  );
  logSuccess(
    `${colors.green}WebSocket available at ws://127.0.0.1:${COLLAB_PORT}/ws${colors.reset}`
  );

  return collabServer;
}

async function startWebServer(): Promise<Subprocess> {
  console.log();
  logStep("Starting Web Server", "bun --bun next dev");
  log(`${colors.dim}Working directory: apps/web${colors.reset}`);
  log(`${colors.dim}Port: ${WEB_PORT}${colors.reset}`);
  console.log();

  const webServer = spawn({
    cmd: ["bun", "--bun", "next", "dev", "-p", String(WEB_PORT)],
    cwd: "./apps/web",
    env: {
      ...process.env,
      NEXT_PUBLIC_COLLAB_WS_URL: `ws://127.0.0.1:${COLLAB_PORT}/ws`,
      NEXT_PUBLIC_E2E_AUTH_MODE: "stub",
      NEXT_PUBLIC_E2E_AUTH_URL: `http://127.0.0.1:${COLLAB_PORT}/api/e2e/session`,
      NEXT_PUBLIC_FIREBASE_API_KEY: "e2e-firebase-api-key",
      NEXT_PUBLIC_FIREBASE_APP_ID: "e2e-firebase-app-id",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "e2e.firebaseapp.test",
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "e2e-firebase-sender-id",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "e2e-firebase-project-id",
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "e2e-firebase-storage-bucket",
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  log(`${icons.timer} Waiting for Web server to be ready...`);

  const isReady = await waitForServer(
    `http://127.0.0.1:${WEB_PORT}`,
    HEALTH_CHECK_TIMEOUT
  );

  if (!isReady) {
    throw new Error(
      `Web server failed to start within ${HEALTH_CHECK_TIMEOUT}ms`
    );
  }

  console.log();
  logSuccess(
    `${colors.bright}${colors.green}Web server is ready!${colors.reset}`
  );
  logSuccess(
    `${colors.green}Listening on http://127.0.0.1:${WEB_PORT}${colors.reset}`
  );

  return webServer;
}

async function runTests(): Promise<number> {
  console.log();
  logStep("Running Tests", "bun x playwright test");
  console.log();

  const proc = spawn({
    cmd: ["bun", "x", "playwright", "test", "--reporter=list"],
    cwd: "./apps/web",
    stdout: "inherit",
    stderr: "inherit",
  });

  return await proc.exited;
}

async function cleanupServers(
  collabServer: Subprocess,
  webServer: Subprocess
): Promise<void> {
  console.log();
  logStep("Cleanup", "Shutting down servers...");

  collabServer.kill();
  webServer.kill();

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const collabHealth = await checkServerHealth(
    `http://127.0.0.1:${COLLAB_PORT}/api/health`,
    1000
  );
  const webHealth = await checkServerHealth(
    `http://127.0.0.1:${WEB_PORT}`,
    1000
  );

  if (collabHealth) {
    logWarning("Collab server may still be running");
  } else {
    logSuccess("Collab server stopped");
  }

  if (webHealth) {
    logWarning("Web server may still be running");
  } else {
    logSuccess("Web server stopped");
  }
}

async function main(): Promise<void> {
  console.log(`${colors.bright}E2E Test Runner${colors.reset}\n`);

  try {
    await cleanupExistingServers();

    const collabServer = await startCollabServer();
    const webServer = await startWebServer();

    console.log();
    logSuccess(`${colors.bright}Both servers are ready!${colors.reset}`);
    log("Starting Playwright tests...\n");

    const exitCode = await runTests();

    await cleanupServers(collabServer, webServer);

    console.log();
    if (exitCode === 0) {
      logSuccess(`${colors.bright}All tests passed!${colors.reset}`);
    } else {
      logWarning(`Tests completed with exit code ${exitCode}`);
    }

    process.exit(exitCode);
  } catch (error) {
    console.error();
    console.error(
      `${colors.red}${icons.cross} Error: ${error instanceof Error ? error.message : String(error)}${colors.reset}`
    );
    process.exit(1);
  }
}

main();
