import { PostHog } from "posthog-node";

let posthogServer: PostHog | null = null;

function getPostHogServerConfig() {
  const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  if (!(apiHost && apiKey)) {
    return null;
  }

  return {
    apiHost,
    apiKey,
  };
}

export function getPostHogServer(): PostHog | null {
  const config = getPostHogServerConfig();

  if (!config) {
    return null;
  }

  posthogServer ??= new PostHog(config.apiKey, {
    flushAt: 1,
    flushInterval: 0,
    host: config.apiHost,
  });

  return posthogServer;
}
