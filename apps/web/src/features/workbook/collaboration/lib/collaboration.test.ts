import { describe, expect, test } from "bun:test";
import {
  buildCollaboratorIdentity,
  buildWorkbookSharePath,
  buildWorkbookShareUrl,
  getCollaboratorInitials,
  isCollaborationAccessRole,
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

    expect(
      parseWorkbookRouteAccess({
        access: ["viewer"],
        shared: ["true"],
      })
    ).toEqual({
      isSharedSession: true,
      requestedAccessRole: "viewer",
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

  test("builds absolute share urls and validates access roles", () => {
    expect(
      buildWorkbookShareUrl(
        "https://papyrus.app/dashboard",
        "workbook-123",
        "editor"
      )
    ).toBe("https://papyrus.app/workbook/workbook-123?access=editor&shared=1");

    expect(isCollaborationAccessRole("editor")).toBe(true);
    expect(isCollaborationAccessRole("viewer")).toBe(true);
    expect(isCollaborationAccessRole("owner")).toBe(false);
  });

  test("derives collaborator identities and initials from email and guest fallbacks", () => {
    expect(getCollaboratorInitials("  ada   lovelace ")).toBe("AL");
    expect(getCollaboratorInitials("solo")).toBe("S");

    expect(
      buildCollaboratorIdentity({
        deviceId: "device-a",
        email: "grace_hopper@example.com",
        userId: "user-a",
      })
    ).toEqual({
      clientId: "device-a",
      color: expect.any(String),
      icon: expect.any(String),
      isAnonymous: false,
      name: "Grace Hopper",
      photoURL: null,
    });

    expect(
      buildCollaboratorIdentity({
        deviceId: "device-b",
        email: null,
        userId: "user-bb7788",
      })
    ).toEqual({
      clientId: "device-b",
      color: expect.any(String),
      icon: expect.any(String),
      isAnonymous: true,
      name: "Guest User B",
      photoURL: null,
    });

    expect(
      buildCollaboratorIdentity({
        deviceId: "device-c",
        email: "@example.com",
        userId: "user-c",
      }).name
    ).toBe("");
  });
});
