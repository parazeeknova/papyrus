import { describe, expect, mock, test } from "bun:test";

import {
  getPostHogBrowserConfig,
  getPostHogDistinctId,
  getPostHogPersonProperties,
  syncPostHogAuthState,
} from "./posthog-auth";

describe("posthog auth helpers", () => {
  test("builds a stable distinct id from the firebase uid", () => {
    expect(getPostHogDistinctId({ uid: "user-123" })).toBe("firebase:user-123");
  });

  test("returns the public person properties without using email as the distinct id", () => {
    expect(
      getPostHogPersonProperties({
        displayName: "Ada Lovelace",
        email: "ada@example.com",
        uid: "user-123",
      })
    ).toEqual({
      authProvider: "firebase-google",
      displayName: "Ada Lovelace",
      email: "ada@example.com",
      firebaseUid: "user-123",
    });
  });

  test("identifies a signed-in user once and captures the login event", () => {
    const client = {
      capture: mock(
        (_eventName: string, _properties?: Record<string, unknown>) => undefined
      ),
      identify: mock(
        (_distinctId: string, _properties?: Record<string, unknown>) =>
          undefined
      ),
      reset: mock(() => undefined),
    };

    const distinctId = syncPostHogAuthState(
      client,
      {
        displayName: "Ada Lovelace",
        email: "ada@example.com",
        uid: "user-123",
      },
      null
    );

    expect(distinctId).toBe("firebase:user-123");
    expect(client.identify).toHaveBeenCalledWith("firebase:user-123", {
      authProvider: "firebase-google",
      displayName: "Ada Lovelace",
      email: "ada@example.com",
      firebaseUid: "user-123",
    });
    expect(client.capture).toHaveBeenCalledWith("auth signed_in", {
      distinctId: "firebase:user-123",
      provider: "google",
    });
    expect(client.reset).not.toHaveBeenCalled();
  });

  test("resets PostHog when a previously identified user signs out", () => {
    const client = {
      capture: mock(
        (_eventName: string, _properties?: Record<string, unknown>) => undefined
      ),
      identify: mock(
        (_distinctId: string, _properties?: Record<string, unknown>) =>
          undefined
      ),
      reset: mock(() => undefined),
    };

    const distinctId = syncPostHogAuthState(client, null, "firebase:user-123");

    expect(distinctId).toBeNull();
    expect(client.capture).toHaveBeenCalledWith("auth signed_out", {
      distinctId: "firebase:user-123",
    });
    expect(client.reset).toHaveBeenCalled();
  });

  test("returns null when PostHog browser env vars are not configured", () => {
    expect(getPostHogBrowserConfig()).toBeNull();
  });
});
