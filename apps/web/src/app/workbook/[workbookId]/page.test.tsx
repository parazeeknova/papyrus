import { describe, expect, test } from "bun:test";
import WorkbookPage from "./page";

describe("WorkbookPage", () => {
  test("ignores legacy shared session query params while sharing is disabled", async () => {
    const element = await WorkbookPage({
      params: Promise.resolve({
        workbookId: "workbook-1",
      }),
    });

    expect(element.props.isSharedSession).toBe(false);
    expect(element.props.workbookId).toBe("workbook-1");
    expect(element.props.requestedAccessRole).toBeUndefined();
  });
});
