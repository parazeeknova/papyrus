import { PostHog } from "posthog-node";

let posthogServer: PostHog | null = null;

export function getPostHogServer(): PostHog | null {
  const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  if (!(apiHost && apiKey)) {
    return null;
  }

  posthogServer ??= new PostHog(apiKey, {
    flushAt: 1,
    flushInterval: 0,
    host: apiHost,
  });

  return posthogServer;
}
