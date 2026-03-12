"use client";

import {
  acquireWorkbookSyncLease,
  deleteRemoteWorkbook,
  listRemoteWorkbooks,
  type RemoteWorkbookState,
  readRemoteWorkbook,
  writeRemoteWorkbook,
} from "@/web/features/spreadsheet/lib/firestore-workbook-sync";

export type CloudWorkbookState = RemoteWorkbookState;

export interface CloudWorkbookStore {
  acquireSyncLease: (
    uid: string,
    workbookId: string,
    clientId: string
  ) => Promise<boolean>;
  deleteWorkbook: (uid: string, workbookId: string) => Promise<void>;
  listWorkbooks: typeof listRemoteWorkbooks;
  readWorkbook: (
    uid: string,
    workbookId: string
  ) => Promise<CloudWorkbookState | null>;
  writeWorkbook: (
    uid: string,
    workbook: CloudWorkbookState,
    clientId: string
  ) => Promise<void>;
}

export const cloudWorkbookStore: CloudWorkbookStore = {
  acquireSyncLease: acquireWorkbookSyncLease,
  deleteWorkbook: deleteRemoteWorkbook,
  listWorkbooks: listRemoteWorkbooks,
  readWorkbook: readRemoteWorkbook,
  writeWorkbook: writeRemoteWorkbook,
};
