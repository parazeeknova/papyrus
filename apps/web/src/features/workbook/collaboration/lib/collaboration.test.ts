import { describe, expect, test } from "bun:test";
import {
  buildWorkbookSharePath,
  parseWorkbookRouteAccess,
} from "./collaboration";

describe("collaboration route helpers", () => {
  test("parses shared workbook access from search params", () => {
    expect(
      parseWorkbookRouteAccess({
        access: "editor",
        shared: "1",
      })
    ).toEqual({
      isSharedSession: true,
      requestedAccessRole: "editor",
    });
  });

  test("fails closed when the requested access role is invalid", () => {
    expect(
      parseWorkbookRouteAccess({
        access: "owner",
        shared: "1",
      })
    ).toEqual({
      isSharedSession: true,
      requestedAccessRole: null,
    });
  });

  test("builds a stable shared workbook path", () => {
    expect(buildWorkbookSharePath("workbook-123", "viewer")).toBe(
      "/workbook/workbook-123?access=viewer&shared=1"
    );
  });
});
