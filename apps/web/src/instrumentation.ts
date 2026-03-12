import { getPostHogServer } from "@/web/platform/posthog/lib/posthog-server";

export function register(): void {
  return;
}

export async function onRequestError(
  error: Error,
  request: Request
): Promise<void> {
  const posthog = getPostHogServer();

  if (!posthog) {
    return;
  }

  const distinctId = request.headers.get("X-POSTHOG-DISTINCT-ID") ?? undefined;
  const sessionId = request.headers.get("X-POSTHOG-SESSION-ID") ?? undefined;

  await posthog.captureException(error, distinctId, {
    $session_id: sessionId,
    path: request.url,
    source: "next-request-error",
  });
}
