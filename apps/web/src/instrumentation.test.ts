import { expect, mock, test } from "bun:test";

const captureException = mock(
  async (
    _error: Error,
    _distinctId: string | undefined,
    _properties: Record<string, unknown>
  ) => undefined
);
const getPostHogServer = mock(
  (): { captureException: typeof captureException } | null => ({
    captureException,
  })
);
const reportWebServerEnvWarnings = mock(() => undefined);

mock.module("@/web/platform/posthog/lib/posthog-server", () => ({
  getPostHogServer,
}));

mock.module("@/web/platform/env/env-diagnostics", () => ({
  collectWebEnvWarnings: (options?: {
    collabWsUrl?: string;
    envName?: string;
    posthogHost?: string;
    posthogKey?: string;
  }) => {
    const envName = options?.envName ?? process.env.NODE_ENV ?? "development";
    const collabWsUrl =
      options && Object.hasOwn(options, "collabWsUrl")
        ? options.collabWsUrl
        : process.env.NEXT_PUBLIC_COLLAB_WS_URL;
    const posthogHost =
      options && Object.hasOwn(options, "posthogHost")
        ? options.posthogHost
        : process.env.NEXT_PUBLIC_POSTHOG_HOST;
    const posthogKey =
      options && Object.hasOwn(options, "posthogKey")
        ? options.posthogKey
        : process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const warnings: Array<{ code: string; message: string }> = [];

    if (envName === "production" && !collabWsUrl) {
      warnings.push({
        code: "missing_collab_ws_url",
        message:
          "NEXT_PUBLIC_COLLAB_WS_URL is not configured in production; Phoenix collaboration sockets will not connect.",
      });
    }

    if (envName !== "production" && !collabWsUrl) {
      warnings.push({
        code: "using_dev_collab_fallback",
        message:
          "NEXT_PUBLIC_COLLAB_WS_URL is not configured; the web app will fall back to the local Phoenix websocket in development.",
      });
    }

    if (!(posthogHost || posthogKey)) {
      warnings.push({
        code: "missing_posthog_configuration",
        message:
          "NEXT_PUBLIC_POSTHOG_HOST and NEXT_PUBLIC_POSTHOG_KEY are not configured; browser observability is disabled.",
      });
    } else if (!(posthogHost && posthogKey)) {
      warnings.push({
        code: "partial_posthog_configuration",
        message:
          "NEXT_PUBLIC_POSTHOG_HOST and NEXT_PUBLIC_POSTHOG_KEY must be configured together; browser observability is incomplete.",
      });
    }

    return warnings;
  },
  reportWebClientEnvWarnings: mock(() => undefined),
  reportWebServerEnvWarnings,
}));

const instrumentation = await import("./instrumentation");

test("register reports server env warnings", () => {
  instrumentation.register();

  expect(reportWebServerEnvWarnings).toHaveBeenCalledTimes(1);
});

test("onRequestError forwards request context to PostHog", async () => {
  await instrumentation.onRequestError(
    new Error("boom"),
    new Request("https://papyrus.test/workbook/1", {
      headers: {
        "X-POSTHOG-DISTINCT-ID": "distinct-1",
        "X-POSTHOG-SESSION-ID": "session-1",
      },
    })
  );

  expect(captureException).toHaveBeenCalledWith(
    expect.any(Error),
    "distinct-1",
    {
      $session_id: "session-1",
      path: "https://papyrus.test/workbook/1",
      source: "next-request-error",
    }
  );
});

test("onRequestError is a no-op when the server client is unavailable", async () => {
  getPostHogServer.mockReturnValueOnce(null);

  await expect(
    instrumentation.onRequestError(
      new Error("boom"),
      new Request("https://papyrus.test/workbook/2")
    )
  ).resolves.toBeUndefined();
});
