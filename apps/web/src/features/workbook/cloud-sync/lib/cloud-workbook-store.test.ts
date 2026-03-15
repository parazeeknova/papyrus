import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { WorkbookMeta } from "@papyrus/core/workbook-types";
import type { CloudWorkbookState } from "./cloud-workbook-store";

const cloudChannelClientMocks = {
  acquireRemoteWorkbookSyncLease: mock<
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
    ) => Promise<{
      lastSyncedAt: string;
      version: number;
    }>
  >(() =>
    Promise.resolve({
      lastSyncedAt: "2026-03-13T00:00:00.000Z",
      version: 5,
    })
  ),
};

mock.module(
  "@/web/features/workbook/cloud-sync/lib/cloud-workbook-channel-client",
  () => {
    return cloudChannelClientMocks;
  }
);

const { cloudWorkbookStore } = await import("./cloud-workbook-store");

describe("cloudWorkbookStore", () => {
  beforeEach(() => {
    for (const mockFn of Object.values(cloudChannelClientMocks)) {
      mockFn.mockClear();
    }
  });

  test("delegates workbook sync operations to the phoenix channel client", async () => {
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

    cloudChannelClientMocks.acquireRemoteWorkbookSyncLease.mockResolvedValue(
      true
    );
    cloudChannelClientMocks.listRemoteWorkbooks.mockResolvedValue(
      listedWorkbooks
    );
    cloudChannelClientMocks.readRemoteWorkbook.mockResolvedValue(workbook);
    cloudChannelClientMocks.writeRemoteWorkbook.mockResolvedValue({
      lastSyncedAt: "2026-03-13T00:00:00.000Z",
      version: 5,
    });

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
    ).resolves.toEqual({
      lastSyncedAt: "2026-03-13T00:00:00.000Z",
      version: 5,
    });

    expect(
      cloudChannelClientMocks.acquireRemoteWorkbookSyncLease
    ).toHaveBeenCalledWith("user-1", "workbook-1", "client-1");
    expect(cloudChannelClientMocks.listRemoteWorkbooks).toHaveBeenCalledWith(
      "user-1"
    );
    expect(cloudChannelClientMocks.readRemoteWorkbook).toHaveBeenCalledWith(
      "user-1",
      "workbook-1"
    );
    expect(cloudChannelClientMocks.writeRemoteWorkbook).toHaveBeenCalledWith(
      "user-1",
      workbook,
      "client-1"
    );
  });

  test("delegates remote workbook deletion to the phoenix channel client", async () => {
    cloudChannelClientMocks.deleteRemoteWorkbook.mockResolvedValue(undefined);

    await expect(
      cloudWorkbookStore.deleteWorkbook("user-1", "workbook-1")
    ).resolves.toBeUndefined();

    expect(cloudChannelClientMocks.deleteRemoteWorkbook).toHaveBeenCalledWith(
      "user-1",
      "workbook-1"
    );
  });
});
