import { describe, expect, test } from "bun:test";
import { collectWebEnvWarnings } from "./env-diagnostics";

describe("collectWebEnvWarnings", () => {
  test("warns when production is missing the explicit collaboration websocket url", () => {
    const warnings = collectWebEnvWarnings({
      collabWsUrl: undefined,
      envName: "production",
      posthogHost: "https://us.i.posthog.com",
      posthogKey: "phc_test",
    });

    expect(
      warnings.some((warning) => warning.code === "missing_collab_ws_url")
    ).toBe(true);
  });

  test("warns when browser posthog config is missing entirely", () => {
    const warnings = collectWebEnvWarnings({
      collabWsUrl: "ws://localhost:4000/ws",
      envName: "development",
      posthogHost: undefined,
      posthogKey: undefined,
    });

    expect(
      warnings.some(
        (warning) => warning.code === "missing_posthog_configuration"
      )
    ).toBe(true);
  });

  test("warns when browser posthog config is only partially configured", () => {
    const warnings = collectWebEnvWarnings({
      collabWsUrl: "ws://localhost:4000/ws",
      envName: "development",
      posthogHost: "https://us.i.posthog.com",
      posthogKey: undefined,
    });

    expect(
      warnings.some(
        (warning) => warning.code === "partial_posthog_configuration"
      )
    ).toBe(true);
  });
});
