"use client";

import type { WorkbookMeta } from "@papyrus/core/workbook-types";
import {
  acquireWorkbookSyncLease,
  deleteRemoteWorkbook,
  listRemoteWorkbooks,
  type RemoteWorkbookState,
  readRemoteWorkbook,
  writeRemoteWorkbook,
} from "@/web/features/spreadsheet/lib/firestore-workbook-sync";
import {
  deleteSharedWorkbookAccess,
  upsertSharedWorkbookAccess,
} from "@/web/features/spreadsheet/lib/share-registry";

export type CloudWorkbookState = RemoteWorkbookState;

export interface CloudWorkbookStore {
  acquireSyncLease: (
    uid: string,
    workbookId: string,
    clientId: string
  ) => Promise<boolean>;
  deleteSharingAccess: (workbookId: string) => Promise<void>;
  deleteWorkbook: (uid: string, workbookId: string) => Promise<void>;
  listWorkbooks: (uid: string) => Promise<WorkbookMeta[]>;
  readWorkbook: (
    uid: string,
    workbookId: string
  ) => Promise<CloudWorkbookState | null>;
  upsertSharingAccess: (
    ownerId: string,
    workbook: Pick<WorkbookMeta, "id" | "sharingAccessRole" | "sharingEnabled">
  ) => Promise<void>;
  writeWorkbook: (
    uid: string,
    workbook: CloudWorkbookState,
    clientId: string
  ) => Promise<void>;
}

export const cloudWorkbookStore: CloudWorkbookStore = {
  acquireSyncLease: acquireWorkbookSyncLease,
  deleteSharingAccess: deleteSharedWorkbookAccess,
  deleteWorkbook: deleteRemoteWorkbook,
  listWorkbooks: listRemoteWorkbooks,
  readWorkbook: readRemoteWorkbook,
  upsertSharingAccess: upsertSharedWorkbookAccess,
  writeWorkbook: writeRemoteWorkbook,
};
