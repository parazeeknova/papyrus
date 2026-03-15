"use client";

import { registerLogSink } from "@papyrus/logs";
import { usePostHog } from "@posthog/react";
import { useEffect, useRef } from "react";
import { onAuthStateChange } from "@/web/platform/auth/auth-client";
import {
  type PostHogAuthClient,
  syncPostHogAuthState,
} from "@/web/platform/posthog/lib/posthog-auth";
import {
  type BrowserPostHogClient,
  forwardLogRecordToPostHog,
} from "@/web/platform/posthog/lib/posthog-log-sink";

export function PostHogAuthStateSync() {
  const posthog = usePostHog();
  const previousDistinctIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!posthog) {
      return;
    }

    const client = posthog as PostHogAuthClient & {
      captureException?: (
        error: Error,
        properties?: Record<string, unknown>
      ) => void;
    };

    const unsubscribeLogs = registerLogSink((record) => {
      if (
        typeof client.capture !== "function" ||
        typeof client.captureException !== "function"
      ) {
        return;
      }

      const logClient: BrowserPostHogClient = {
        capture: client.capture,
        captureException: client.captureException,
      };

      forwardLogRecordToPostHog(logClient, record);
    });

    const unsubscribeAuth = onAuthStateChange((nextUser) => {
      previousDistinctIdRef.current = syncPostHogAuthState(
        client,
        nextUser,
        previousDistinctIdRef.current
      );
    });

    return () => {
      unsubscribeLogs();
      unsubscribeAuth();
    };
  }, [posthog]);

  return null;
}
