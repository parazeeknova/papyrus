import { createLogger } from "@papyrus/logs";

const envLogger = createLogger({ scope: "web-env" });

interface WebEnvWarning {
  code:
    | "missing_collab_ws_url"
    | "missing_posthog_configuration"
    | "partial_posthog_configuration"
    | "using_dev_collab_fallback";
  message: string;
}

let hasReportedClientWarnings = false;
let hasReportedServerWarnings = false;

export function collectWebEnvWarnings(options?: {
  collabWsUrl?: string;
  envName?: string;
  posthogHost?: string;
  posthogKey?: string;
}): WebEnvWarning[] {
  const envName = options?.envName ?? process.env.NODE_ENV ?? "development";
  const collabWsUrl =
    options?.collabWsUrl ?? process.env.NEXT_PUBLIC_COLLAB_WS_URL;
  const posthogHost =
    options?.posthogHost ?? process.env.NEXT_PUBLIC_POSTHOG_HOST;
  const posthogKey = options?.posthogKey ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;

  const warnings: WebEnvWarning[] = [];

  if (envName === "production" && !collabWsUrl) {
    warnings.push({
      code: "missing_collab_ws_url",
      message:
        "NEXT_PUBLIC_COLLAB_WS_URL is not configured in production; Phoenix collaboration sockets will not connect.",
    });
  }

  if (envName !== "production" && !collabWsUrl) {
    warnings.push({
      code: "using_dev_collab_fallback",
      message:
        "NEXT_PUBLIC_COLLAB_WS_URL is not configured; the web app will fall back to the local Phoenix websocket in development.",
    });
  }

  if (!(posthogHost || posthogKey)) {
    warnings.push({
      code: "missing_posthog_configuration",
      message:
        "NEXT_PUBLIC_POSTHOG_HOST and NEXT_PUBLIC_POSTHOG_KEY are not configured; browser observability is disabled.",
    });
  } else if (!(posthogHost && posthogKey)) {
    warnings.push({
      code: "partial_posthog_configuration",
      message:
        "NEXT_PUBLIC_POSTHOG_HOST and NEXT_PUBLIC_POSTHOG_KEY must be configured together; browser observability is incomplete.",
    });
  }

  return warnings;
}

export function reportWebClientEnvWarnings(): void {
  if (hasReportedClientWarnings) {
    return;
  }

  hasReportedClientWarnings = true;
  for (const warning of collectWebEnvWarnings()) {
    envLogger.warn(warning.message, {
      environment: process.env.NODE_ENV ?? "development",
      warningCode: warning.code,
    });
  }
}

export function reportWebServerEnvWarnings(): void {
  if (hasReportedServerWarnings) {
    return;
  }

  hasReportedServerWarnings = true;
  const warnings = collectWebEnvWarnings({
    collabWsUrl: process.env.NEXT_PUBLIC_COLLAB_WS_URL,
    envName: process.env.NODE_ENV ?? "development",
    posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  });

  for (const warning of warnings) {
    envLogger.warn(warning.message, {
      environment: process.env.NODE_ENV ?? "development",
      warningCode: warning.code,
    });
  }
}
