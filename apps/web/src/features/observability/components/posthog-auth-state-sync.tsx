"use client";

import { registerLogSink } from "@papyrus/logs";
import { usePostHog } from "@posthog/react";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useRef } from "react";
import { firebaseAuth } from "@/web/features/auth/lib/firebase-auth";
import {
  type PostHogAuthClient,
  syncPostHogAuthState,
} from "@/web/features/observability/lib/posthog-auth";
import {
  type BrowserPostHogClient,
  forwardLogRecordToPostHog,
} from "@/web/features/observability/lib/posthog-log-sink";

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

    const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (nextUser) => {
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
