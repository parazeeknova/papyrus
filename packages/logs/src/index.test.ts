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
});
