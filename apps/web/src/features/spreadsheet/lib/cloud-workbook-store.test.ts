import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { WorkbookMeta } from "@papyrus/core/workbook-types";
import type { CloudWorkbookState } from "./cloud-workbook-store";

const firestoreSyncMocks = {
  acquireWorkbookSyncLease: mock<
    (uid: string, workbookId: string, clientId: string) => Promise<boolean>
  >(() => Promise.resolve(true)),
  deleteRemoteWorkbook: mock<
    (uid: string, workbookId: string) => Promise<void>
  >(() => Promise.resolve(undefined)),
  listRemoteWorkbooks: mock<(uid: string) => Promise<WorkbookMeta[]>>(() =>
    Promise.resolve([])
  ),
  readRemoteWorkbook: mock<
    (uid: string, workbookId: string) => Promise<CloudWorkbookState | null>
  >(() => Promise.resolve(null)),
  writeRemoteWorkbook: mock<
    (
      uid: string,
      workbook: CloudWorkbookState,
      clientId: string
    ) => Promise<void>
  >(() => Promise.resolve(undefined)),
};

mock.module("@/web/features/spreadsheet/lib/firestore-workbook-sync", () => {
  return firestoreSyncMocks;
});

const { cloudWorkbookStore } = await import("./cloud-workbook-store");

describe("cloudWorkbookStore", () => {
  beforeEach(() => {
    for (const mockFn of Object.values(firestoreSyncMocks)) {
      mockFn.mockClear();
    }
  });

  test("delegates workbook sync operations to the firestore adapter", async () => {
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

  test("delegates remote workbook deletion to the firestore adapter", async () => {
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
