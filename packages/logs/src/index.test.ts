import { beforeEach, describe, expect, mock, test } from "bun:test";

import {
  createLogger,
  LOG_LEVEL,
  type LogRecord,
  registerLogSink,
} from "./index";

describe("registerLogSink", () => {
  const sink = mock((_record: LogRecord) => undefined);
  let unregister: (() => void) | null = null;

  beforeEach(() => {
    sink.mockClear();
    unregister?.();
    unregister = null;
  });

  test("forwards log records to registered sinks", () => {
    const logger = createLogger({ scope: "sync" });

    unregister = registerLogSink(sink);
    logger.info("Workbook synced", { workbookId: "workbook-1" });

    expect(sink).toHaveBeenCalledWith({
      level: LOG_LEVEL.INFO,
      message: "Workbook synced",
      meta: [{ workbookId: "workbook-1" }],
      scope: "sync",
    });
  });

  test("stops forwarding log records after unregistering the sink", () => {
    const logger = createLogger({ scope: "sync" });

    unregister = registerLogSink(sink);
    unregister();
    unregister = null;

    logger.error("Failed to sync workbook");

    expect(sink).not.toHaveBeenCalled();
  });

  test("writes to the console in development while still forwarding to sinks", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const consoleInfo = mock(() => undefined);
    const consoleWarn = mock(() => undefined);
    const consoleError = mock(() => undefined);

    process.env.NODE_ENV = "development";

    const logger = createLogger({ scope: "sync" });
    const localSink = mock((_record: LogRecord) => undefined);
    const unregisterLocalSink = registerLogSink(localSink);
    const originalConsoleInfo = console.info;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;

    console.info = consoleInfo;
    console.warn = consoleWarn;
    console.error = consoleError;

    try {
      logger.debug("debug message");
      logger.warn("warn message");
      logger.error("error message");
    } finally {
      unregisterLocalSink();
      console.info = originalConsoleInfo;
      console.warn = originalConsoleWarn;
      console.error = originalConsoleError;
      process.env.NODE_ENV = originalNodeEnv;
    }

    expect(consoleInfo).toHaveBeenCalledWith("[DEBUG][sync]", "debug message");
    expect(consoleWarn).toHaveBeenCalledWith("[WARN][sync]", "warn message");
    expect(consoleError).toHaveBeenCalledWith("[ERROR][sync]", "error message");
    expect(localSink).toHaveBeenCalledTimes(3);
  });

  test("forwards logs without touching the console outside development", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const consoleInfo = mock(() => undefined);
    const originalConsoleInfo = console.info;

    process.env.NODE_ENV = "production";

    const logger = createLogger({ scope: "sync" });
    const localSink = mock((_record: LogRecord) => undefined);
    const unregisterLocalSink = registerLogSink(localSink);

    console.info = consoleInfo;

    try {
      logger.info("Workbook synced");
    } finally {
      unregisterLocalSink();
      console.info = originalConsoleInfo;
      process.env.NODE_ENV = originalNodeEnv;
    }

    expect(consoleInfo).not.toHaveBeenCalled();
    expect(localSink).toHaveBeenCalledWith({
      level: LOG_LEVEL.INFO,
      message: "Workbook synced",
      meta: [],
      scope: "sync",
    });
  });
});
