import type { User } from "firebase/auth";
import { env } from "@/web/env";

export interface PostHogAuthClient {
  capture: (eventName: string, properties?: Record<string, unknown>) => void;
  identify: (distinctId: string, properties?: Record<string, unknown>) => void;
  reset: () => void;
}

export interface PostHogBrowserConfig {
  apiHost: string;
  apiKey: string;
}

export function getPostHogBrowserConfig(): PostHogBrowserConfig | null {
  if (!(env.NEXT_PUBLIC_POSTHOG_HOST && env.NEXT_PUBLIC_POSTHOG_KEY)) {
    return null;
  }

  return {
    apiHost: env.NEXT_PUBLIC_POSTHOG_HOST,
    apiKey: env.NEXT_PUBLIC_POSTHOG_KEY,
  };
}

export function getPostHogDistinctId(user: Pick<User, "uid">): string {
  return `firebase:${user.uid}`;
}

export function getPostHogPersonProperties(
  user: Pick<User, "displayName" | "email" | "uid">
): Record<string, unknown> {
  return {
    authProvider: "firebase-google",
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    firebaseUid: user.uid,
  };
}

export function syncPostHogAuthState(
  client: PostHogAuthClient,
  nextUser: Pick<User, "displayName" | "email" | "uid"> | null,
  previousDistinctId: string | null
): string | null {
  if (!nextUser) {
    if (previousDistinctId) {
      client.capture("auth signed_out", {
        distinctId: previousDistinctId,
      });
      client.reset();
    }

    return null;
  }

  const nextDistinctId = getPostHogDistinctId(nextUser);

  if (nextDistinctId !== previousDistinctId) {
    client.identify(nextDistinctId, getPostHogPersonProperties(nextUser));
    client.capture("auth signed_in", {
      distinctId: nextDistinctId,
      provider: "google",
    });
  }

  return nextDistinctId;
}
