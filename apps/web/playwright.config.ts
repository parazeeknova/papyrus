import { defineConfig, devices } from "@playwright/test";

const collabTestEnvironment = {
  E2E_AUTH_ENABLED: "true",
  MIX_ENV: "test",
  PHX_SERVER: "true",
  PORT: "4000",
};

const webTestEnvironment = {
  NEXT_PUBLIC_COLLAB_WS_URL: "ws://127.0.0.1:4000/ws",
  NEXT_PUBLIC_E2E_AUTH_MODE: "stub",
  NEXT_PUBLIC_E2E_AUTH_URL: "http://127.0.0.1:4000/api/e2e/session",
  NEXT_PUBLIC_FIREBASE_API_KEY: "e2e-firebase-api-key",
  NEXT_PUBLIC_FIREBASE_APP_ID: "e2e-firebase-app-id",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "e2e.firebaseapp.test",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "e2e-firebase-sender-id",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "e2e-firebase-project-id",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "e2e-firebase-storage-bucket",
};

const webServerCommand = process.env.CI
  ? "bun run build && bun run start"
  : "bun run dev";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  workers: 1,
  webServer: [
    {
      command: "mix phx.server",
      cwd: "../collab",
      env: collabTestEnvironment,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: "http://127.0.0.1:4000/api/health",
    },
    {
      command: webServerCommand,
      cwd: ".",
      env: webTestEnvironment,
      reuseExistingServer: !process.env.CI,
      timeout: process.env.CI ? 300_000 : 120_000,
      url: "http://127.0.0.1:3000",
    },
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3000",
    channel: "chrome",
    trace: "retain-on-failure",
  },
});
