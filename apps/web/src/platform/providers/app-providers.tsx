"use client";

import { PostHogProvider } from "@posthog/react";
import posthog from "posthog-js";
import { useEffect } from "react";
import { PostHogAuthStateSync } from "@/web/platform/posthog/components/posthog-auth-state-sync";
import { getPostHogBrowserConfig } from "@/web/platform/posthog/lib/posthog-auth";
import { TooltipProvider } from "@/web/shared/ui/tooltip";

let hasInitializedPostHog = false;

function PostHogClientProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useEffect(() => {
    const config = getPostHogBrowserConfig();

    if (!config || hasInitializedPostHog) {
      return;
    }

    // Spreadsheet interactions are sensitive, so keep automatic DOM
    // autocapture off and only send explicit logs, auth events, and errors.
    posthog.init(config.apiKey, {
      api_host: config.apiHost,
      autocapture: false,
      capture_exceptions: {
        capture_console_errors: false,
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
      },
    });
    hasInitializedPostHog = true;
  }, []);

  const config = getPostHogBrowserConfig();

  if (!config) {
    return <>{children}</>;
  }

  return (
    <PostHogProvider client={posthog}>
      <PostHogAuthStateSync />
      {children}
    </PostHogProvider>
  );
}

export function AppProviders({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <PostHogClientProvider>
      <TooltipProvider>{children}</TooltipProvider>
    </PostHogClientProvider>
  );
}
