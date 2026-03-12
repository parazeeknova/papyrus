import type { LogRecord } from "@papyrus/logs";

export interface BrowserPostHogClient {
  capture: (eventName: string, properties?: Record<string, unknown>) => void;
  captureException: (
    error: Error,
    properties?: Record<string, unknown>
  ) => void;
}

function serializeLogMetaValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack ?? null,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeLogMetaValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        serializeLogMetaValue(entry),
      ])
    );
  }

  return value;
}

export function forwardLogRecordToPostHog(
  client: BrowserPostHogClient,
  record: LogRecord
): void {
  if (record.level === "DEBUG") {
    return;
  }

  const error = record.meta.find(
    (value): value is Error => value instanceof Error
  );
  const properties = {
    level: record.level.toLowerCase(),
    message: record.message,
    meta: record.meta.map((value) => serializeLogMetaValue(value)),
    scope: record.scope ?? "app",
    source: "browser",
  };

  client.capture("app log", properties);

  if (error) {
    client.captureException(error, {
      logLevel: record.level.toLowerCase(),
      logMessage: record.message,
      logScope: record.scope ?? "app",
    });
  }
}
