import type { WorkbookMeta } from "@papyrus/core/workbook-types";
import { describe, expect, it } from "vitest";
import {
  shouldHydrateLocalWorkbook,
  shouldUploadLocalWorkbook,
} from "./cloud-sync-reconciliation";

function createWorkbookMeta(updatedAt: string): WorkbookMeta {
  return {
    createdAt: "2026-03-12T00:00:00.000Z",
    id: `workbook-${updatedAt}`,
    isFavorite: false,
    lastOpenedAt: updatedAt,
    lastSyncedAt: null,
    name: "Workbook",
    remoteVersion: null,
    sharingAccessRole: "viewer",
    sharingEnabled: false,
    updatedAt,
  };
}

describe("cloud sync reconciliation", () => {
  it("hydrates a missing local workbook from the remote snapshot", () => {
    expect(
      shouldHydrateLocalWorkbook(createWorkbookMeta("2026-03-12T12:00:00.000Z"))
    ).toBe(true);
  });

  it("hydrates the local workbook when the remote version is newer", () => {
    expect(
      shouldHydrateLocalWorkbook(
        createWorkbookMeta("2026-03-12T12:00:00.000Z"),
        createWorkbookMeta("2026-03-12T11:00:00.000Z")
      )
    ).toBe(true);
  });

  it("keeps the local workbook when it is at least as new as the remote one", () => {
    expect(
      shouldHydrateLocalWorkbook(
        createWorkbookMeta("2026-03-12T11:00:00.000Z"),
        createWorkbookMeta("2026-03-12T12:00:00.000Z")
      )
    ).toBe(false);
    expect(
      shouldHydrateLocalWorkbook(
        createWorkbookMeta("2026-03-12T12:00:00.000Z"),
        createWorkbookMeta("2026-03-12T12:00:00.000Z")
      )
    ).toBe(false);
  });

  it("uploads a local workbook when no remote copy exists yet", () => {
    expect(
      shouldUploadLocalWorkbook(createWorkbookMeta("2026-03-12T12:00:00.000Z"))
    ).toBe(true);
  });

  it("uploads the local workbook when it is newer than the remote copy", () => {
    expect(
      shouldUploadLocalWorkbook(
        createWorkbookMeta("2026-03-12T12:00:00.000Z"),
        createWorkbookMeta("2026-03-12T11:00:00.000Z")
      )
    ).toBe(true);
  });

  it("skips uploads when the remote copy is at least as new", () => {
    expect(
      shouldUploadLocalWorkbook(
        createWorkbookMeta("2026-03-12T11:00:00.000Z"),
        createWorkbookMeta("2026-03-12T12:00:00.000Z")
      )
    ).toBe(false);
    expect(
      shouldUploadLocalWorkbook(
        createWorkbookMeta("2026-03-12T12:00:00.000Z"),
        createWorkbookMeta("2026-03-12T12:00:00.000Z")
      )
    ).toBe(false);
  });
});
