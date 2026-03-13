import type { AuthenticatedUser } from "@/web/platform/auth/auth-client";
import { env } from "@/web/platform/env/client-env";

export interface PostHogAuthClient {
  capture: (eventName: string, properties?: Record<string, unknown>) => void;
  identify: (distinctId: string, properties?: Record<string, unknown>) => void;
  reset: () => void;
}

export interface PostHogBrowserConfig {
  apiHost: string;
  apiKey: string;
}

interface PostHogBrowserEnv {
  apiHost?: string;
  apiKey?: string;
}

export function getPostHogBrowserConfig(
  browserEnv: PostHogBrowserEnv = {
    apiHost: env.NEXT_PUBLIC_POSTHOG_HOST,
    apiKey: env.NEXT_PUBLIC_POSTHOG_KEY,
  }
): PostHogBrowserConfig | null {
  if (!(browserEnv.apiHost && browserEnv.apiKey)) {
    return null;
  }

  return {
    apiHost: browserEnv.apiHost,
    apiKey: browserEnv.apiKey,
  };
}

export function getPostHogDistinctId(
  user: Pick<AuthenticatedUser, "uid">
): string {
  return `firebase:${user.uid}`;
}

export function getPostHogPersonProperties(
  user: Pick<AuthenticatedUser, "displayName" | "email" | "uid">
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
  nextUser: Pick<AuthenticatedUser, "displayName" | "email" | "uid"> | null,
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
