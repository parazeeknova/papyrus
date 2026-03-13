"use client";

import type { WorkbookMeta } from "@papyrus/core/workbook-types";
import {
  acquireRemoteWorkbookSyncLease,
  type CloudWorkbookWriteResult,
  deleteRemoteWorkbook,
  listRemoteWorkbooks,
  readRemoteWorkbook,
  writeRemoteWorkbook,
} from "@/web/features/workbook/cloud-sync/lib/cloud-workbook-channel-client";

export interface CloudWorkbookState {
  activeSheetId: string | null;
  meta: WorkbookMeta;
  update: Uint8Array;
  version: number;
}

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
  ) => Promise<CloudWorkbookWriteResult>;
}

export const cloudWorkbookStore: CloudWorkbookStore = {
  acquireSyncLease: acquireRemoteWorkbookSyncLease,
  deleteWorkbook: deleteRemoteWorkbook,
  listWorkbooks: listRemoteWorkbooks,
  readWorkbook: readRemoteWorkbook,
  writeWorkbook: writeRemoteWorkbook,
};
