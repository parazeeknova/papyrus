import type { WorkbookMeta } from "@papyrus/core/workbook-types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreSyncMocks = vi.hoisted(() => {
  return {
    acquireWorkbookSyncLease: vi.fn(),
    deleteRemoteWorkbook: vi.fn(),
    listRemoteWorkbooks: vi.fn(),
    readRemoteWorkbook: vi.fn(),
    writeRemoteWorkbook: vi.fn(),
  };
});

const shareRegistryMocks = vi.hoisted(() => {
  return {
    deleteSharedWorkbookAccess: vi.fn(),
    upsertSharedWorkbookAccess: vi.fn(),
  };
});

vi.mock("@/web/features/spreadsheet/lib/firestore-workbook-sync", () => {
  return firestoreSyncMocks;
});

vi.mock("@/web/features/spreadsheet/lib/share-registry", () => {
  return shareRegistryMocks;
});

import { cloudWorkbookStore } from "./cloud-workbook-store";

describe("cloudWorkbookStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates workbook sync operations to the firestore adapter", async () => {
    const workbook = {
      activeSheetId: "sheet-1",
      meta: {
        createdAt: "2026-03-12T00:00:00.000Z",
        id: "workbook-1",
        isFavorite: false,
        lastOpenedAt: "2026-03-12T00:00:00.000Z",
        lastSyncedAt: null,
        name: "Budget",
        remoteVersion: null,
        sharingAccessRole: "viewer",
        sharingEnabled: false,
        updatedAt: "2026-03-12T00:00:00.000Z",
      } satisfies WorkbookMeta,
      update: new Uint8Array([1, 2, 3]),
      version: 4,
    };

    const listedWorkbooks = [workbook.meta];

    firestoreSyncMocks.acquireWorkbookSyncLease.mockResolvedValue(true);
    firestoreSyncMocks.listRemoteWorkbooks.mockResolvedValue(listedWorkbooks);
    firestoreSyncMocks.readRemoteWorkbook.mockResolvedValue(workbook);
    firestoreSyncMocks.writeRemoteWorkbook.mockResolvedValue(undefined);

    await expect(
      cloudWorkbookStore.acquireSyncLease("user-1", "workbook-1", "client-1")
    ).resolves.toBe(true);
    await expect(cloudWorkbookStore.listWorkbooks("user-1")).resolves.toEqual(
      listedWorkbooks
    );
    await expect(
      cloudWorkbookStore.readWorkbook("user-1", "workbook-1")
    ).resolves.toEqual(workbook);
    await expect(
      cloudWorkbookStore.writeWorkbook("user-1", workbook, "client-1")
    ).resolves.toBeUndefined();

    expect(firestoreSyncMocks.acquireWorkbookSyncLease).toHaveBeenCalledWith(
      "user-1",
      "workbook-1",
      "client-1"
    );
    expect(firestoreSyncMocks.listRemoteWorkbooks).toHaveBeenCalledWith(
      "user-1"
    );
    expect(firestoreSyncMocks.readRemoteWorkbook).toHaveBeenCalledWith(
      "user-1",
      "workbook-1"
    );
    expect(firestoreSyncMocks.writeRemoteWorkbook).toHaveBeenCalledWith(
      "user-1",
      workbook,
      "client-1"
    );
  });

  it("delegates sharing updates to the share registry adapter", async () => {
    const workbook = {
      id: "workbook-1",
      sharingAccessRole: "editor" as const,
      sharingEnabled: true,
    };

    shareRegistryMocks.upsertSharedWorkbookAccess.mockResolvedValue(undefined);
    shareRegistryMocks.deleteSharedWorkbookAccess.mockResolvedValue(undefined);

    await expect(
      cloudWorkbookStore.upsertSharingAccess("user-1", workbook)
    ).resolves.toBeUndefined();
    await expect(
      cloudWorkbookStore.deleteSharingAccess("workbook-1")
    ).resolves.toBeUndefined();

    expect(shareRegistryMocks.upsertSharedWorkbookAccess).toHaveBeenCalledWith(
      "user-1",
      workbook
    );
    expect(shareRegistryMocks.deleteSharedWorkbookAccess).toHaveBeenCalledWith(
      "workbook-1"
    );
  });

  it("delegates remote workbook deletion to the firestore adapter", async () => {
    firestoreSyncMocks.deleteRemoteWorkbook.mockResolvedValue(undefined);

    await expect(
      cloudWorkbookStore.deleteWorkbook("user-1", "workbook-1")
    ).resolves.toBeUndefined();

    expect(firestoreSyncMocks.deleteRemoteWorkbook).toHaveBeenCalledWith(
      "user-1",
      "workbook-1"
    );
  });
});
