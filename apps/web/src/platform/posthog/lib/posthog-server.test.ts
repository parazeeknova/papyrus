import { afterEach, beforeEach, expect, mock, test } from "bun:test";

const constructorCalls: Array<{
  apiKey: string;
  options: Record<string, unknown>;
}> = [];

class PostHogStub {
  constructor(apiKey: string, options: Record<string, unknown>) {
    constructorCalls.push({ apiKey, options });
  }
}

mock.module("posthog-node", () => ({
  PostHog: PostHogStub,
}));

const originalEnv = {
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
};

beforeEach(() => {
  constructorCalls.length = 0;
});

afterEach(() => {
  process.env.NEXT_PUBLIC_POSTHOG_HOST = originalEnv.NEXT_PUBLIC_POSTHOG_HOST;
  process.env.NEXT_PUBLIC_POSTHOG_KEY = originalEnv.NEXT_PUBLIC_POSTHOG_KEY;
});

test("returns null when the PostHog server env is incomplete", async () => {
  process.env.NEXT_PUBLIC_POSTHOG_HOST = "";
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "";

  const { getPostHogServer } = await import(
    `./posthog-server.ts?missing-${Date.now()}`
  );

  expect(getPostHogServer()).toBeNull();
});

test("returns null when the PostHog server env is only partially configured", async () => {
  process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "";

  const { getPostHogServer } = await import(
    `./posthog-server.ts?partial-${Date.now()}`
  );

  expect(getPostHogServer()).toBeNull();
});

test("creates and caches the PostHog server client", async () => {
  process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "project-key";

  const { getPostHogServer } = await import(
    `./posthog-server.ts?configured-${Date.now()}`
  );

  const firstClient = getPostHogServer();
  const secondClient = getPostHogServer();

  expect(firstClient).toBe(secondClient);
  expect(constructorCalls).toEqual([
    {
      apiKey: "project-key",
      options: {
        flushAt: 1,
        flushInterval: 0,
        host: "https://us.i.posthog.com",
      },
    },
  ]);
});
