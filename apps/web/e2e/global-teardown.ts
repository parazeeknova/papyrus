// Global teardown for Playwright
// Ensures all test servers are properly shut down after tests complete

async function globalTeardown(): Promise<void> {
  console.log("\n[Teardown] Cleaning up test servers...");

  // Kill processes on test ports
  const ports = [3001, 4001];

  for (const port of ports) {
    try {
      const { spawn } = await import("bun");
      const lsofProc = spawn({
        cmd: ["lsof", "-t", "-i", `:${port}`],
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = await lsofProc.exited;
      if (exitCode === 0) {
        const pid = await new Response(lsofProc.stdout).text();
        if (pid.trim()) {
          spawn({
            cmd: ["kill", "-9", pid.trim()],
            stdout: "ignore",
            stderr: "ignore",
          });
          console.log(`[Teardown] Killed process on port ${port}`);
        }
      }
    } catch {
      // Ignore errors
    }
  }

  // Wait for processes to terminate
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log("[Teardown] Servers cleaned up\n");
}

export default globalTeardown;
