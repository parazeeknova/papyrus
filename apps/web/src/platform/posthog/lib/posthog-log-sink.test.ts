import { describe, expect, mock, test } from "bun:test";

import type { LogRecord } from "@papyrus/logs";

import { forwardLogRecordToPostHog } from "./posthog-log-sink";

describe("forwardLogRecordToPostHog", () => {
  test("captures non-debug log records as structured PostHog events", () => {
    const client = {
      capture: mock(
        (_eventName: string, _properties?: Record<string, unknown>) => undefined
      ),
      captureException: mock(
        (_error: Error, _properties?: Record<string, unknown>) => undefined
      ),
    };

    const record: LogRecord = {
      level: "INFO",
      message: "Workbook synced",
      meta: [{ workbookId: "workbook-1" }],
      scope: "spreadsheet-sync",
    };

    forwardLogRecordToPostHog(client, record);

    expect(client.capture).toHaveBeenCalledWith("app log", {
      level: "info",
      message: "Workbook synced",
      meta: [{ workbookId: "workbook-1" }],
      scope: "spreadsheet-sync",
      source: "browser",
    });
    expect(client.captureException).not.toHaveBeenCalled();
  });

  test("captures error metadata as both a structured log and an exception", () => {
    const client = {
      capture: mock(
        (_eventName: string, _properties?: Record<string, unknown>) => undefined
      ),
      captureException: mock(
        (_error: Error, _properties?: Record<string, unknown>) => undefined
      ),
    };
    const error = new Error("boom");

    forwardLogRecordToPostHog(client, {
      level: "ERROR",
      message: "Failed to sync workbook",
      meta: [error],
      scope: "spreadsheet-sync",
    });

    expect(client.capture).toHaveBeenCalled();
    expect(client.captureException).toHaveBeenCalledWith(error, {
      logLevel: "error",
      logMessage: "Failed to sync workbook",
      logScope: "spreadsheet-sync",
    });
  });

  test("drops debug logs to avoid noisy browser telemetry", () => {
    const client = {
      capture: mock(
        (_eventName: string, _properties?: Record<string, unknown>) => undefined
      ),
      captureException: mock(
        (_error: Error, _properties?: Record<string, unknown>) => undefined
      ),
    };

    forwardLogRecordToPostHog(client, {
      level: "DEBUG",
      message: "scheduled debounce",
      meta: [],
      scope: "spreadsheet-sync",
    });

    expect(client.capture).not.toHaveBeenCalled();
    expect(client.captureException).not.toHaveBeenCalled();
  });
});
