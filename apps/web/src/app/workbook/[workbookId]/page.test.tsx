import { describe, expect, test } from "bun:test";
import WorkbookPage from "./page";

describe("WorkbookPage", () => {
  test("defaults to an owned workbook session without share params", async () => {
    const element = await WorkbookPage({
      params: Promise.resolve({
        workbookId: "workbook-1",
      }),
    });

    expect(element.props.isSharedSession).toBe(false);
    expect(element.props.workbookId).toBe("workbook-1");
    expect(element.props.requestedAccessRole).toBe(null);
  });

  test("enables shared workbook mode when the route requests viewer access", async () => {
    const element = await WorkbookPage({
      params: Promise.resolve({
        workbookId: "workbook-1",
      }),
      searchParams: Promise.resolve({
        access: "viewer",
        shared: "1",
      }),
    });

    expect(element.props.isSharedSession).toBe(true);
    expect(element.props.requestedAccessRole).toBe("viewer");
  });
});
