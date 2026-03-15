"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

export function GlobalErrorSurface({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    if (typeof posthog.captureException !== "function") {
      return;
    }

    try {
      posthog.captureException(error, {
        digest: error.digest ?? null,
        surface: "global-error-boundary",
      });
    } catch {
      // Telemetry failures must never block the recovery surface.
    }
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-semibold text-2xl">Something broke.</h1>
      <p className="max-w-md text-muted-foreground text-sm">
        The failure was captured for investigation. Try the action again.
      </p>
      <button
        className="rounded-md border border-border px-4 py-2 text-sm"
        onClick={() => {
          reset();
        }}
        type="button"
      >
        Retry
      </button>
    </main>
  );
}

export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <GlobalErrorSurface error={error} reset={reset} />
      </body>
    </html>
  );
}
