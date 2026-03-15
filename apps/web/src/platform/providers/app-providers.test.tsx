import { expect, mock, test } from "bun:test";
import { render } from "@testing-library/react";

const init = mock(() => undefined);
interface PublicEnv {
  NEXT_PUBLIC_COLLAB_WS_URL?: string;
  NEXT_PUBLIC_E2E_AUTH_MODE?: "stub";
  NEXT_PUBLIC_E2E_AUTH_URL?: string;
  NEXT_PUBLIC_FIREBASE_API_KEY: string;
  NEXT_PUBLIC_FIREBASE_APP_ID: string;
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: string;
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: string;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: string;
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: string;
  NEXT_PUBLIC_POSTHOG_HOST?: string;
  NEXT_PUBLIC_POSTHOG_KEY?: string;
}

const publicEnv: PublicEnv = {
  NEXT_PUBLIC_COLLAB_WS_URL: "ws://localhost:4000/ws",
  NEXT_PUBLIC_E2E_AUTH_MODE: undefined,
  NEXT_PUBLIC_E2E_AUTH_URL: undefined,
  NEXT_PUBLIC_FIREBASE_API_KEY: "firebase-api-key",
  NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "papyrus.firebaseapp.test",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "firebase-sender-id",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "firebase-project-id",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "firebase-bucket",
  NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
  NEXT_PUBLIC_POSTHOG_KEY: "project-key",
};
const postHogProvider = mock(({ children }: { children: React.ReactNode }) => (
  <div data-testid="posthog-provider">{children}</div>
));
const postHogAuthStateSync = mock(() => (
  <div data-testid="posthog-auth-sync" />
));

mock.module("posthog-js", () => ({
  default: {
    init,
  },
}));

mock.module("@posthog/react", () => ({
  PostHogProvider: postHogProvider,
}));

mock.module(
  "@/web/platform/posthog/components/posthog-auth-state-sync",
  () => ({
    PostHogAuthStateSync: postHogAuthStateSync,
  })
);

mock.module("@/web/platform/env/client-env", () => ({
  env: publicEnv,
}));

let appProvidersImportCounter = 0;

function importAppProviders() {
  appProvidersImportCounter += 1;
  return import(`./app-providers.tsx?test=${appProvidersImportCounter}`);
}

test("initializes and wraps PostHog when browser config is present", async () => {
  publicEnv.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";
  publicEnv.NEXT_PUBLIC_POSTHOG_KEY = "project-key";
  init.mockClear();

  const { AppProviders } = await importAppProviders();

  const view = render(
    <AppProviders>
      <div>child content</div>
    </AppProviders>
  );

  expect(view.getByTestId("posthog-provider")).not.toBeNull();
  expect(view.getByTestId("posthog-auth-sync")).not.toBeNull();
  expect(init).toHaveBeenCalledWith("project-key", {
    api_host: "https://us.i.posthog.com",
    autocapture: false,
    capture_exceptions: {
      capture_console_errors: false,
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
    },
  });
});

test("does not initialize PostHog a second time after the client is bootstrapped", async () => {
  publicEnv.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";
  publicEnv.NEXT_PUBLIC_POSTHOG_KEY = "project-key";

  const { AppProviders } = await importAppProviders();

  init.mockClear();

  const firstView = render(
    <AppProviders>
      <div>child content</div>
    </AppProviders>
  );

  expect(init).toHaveBeenCalledTimes(1);

  firstView.unmount();
  init.mockClear();

  render(
    <AppProviders>
      <div>child content</div>
    </AppProviders>
  );

  expect(init).not.toHaveBeenCalled();
});

test("falls back to the bare children when browser posthog config is unavailable", async () => {
  publicEnv.NEXT_PUBLIC_POSTHOG_HOST = undefined;
  publicEnv.NEXT_PUBLIC_POSTHOG_KEY = undefined;
  init.mockClear();

  const { AppProviders } = await importAppProviders();

  const view = render(
    <AppProviders>
      <div data-testid="bare-child">child content</div>
    </AppProviders>
  );

  expect(view.getByTestId("bare-child")).not.toBeNull();
  expect(view.queryByTestId("posthog-provider")).toBeNull();
  expect(init).not.toHaveBeenCalled();
});
