"use client";

import type {
  CollaborationAccessRole,
  CollaboratorIdentity,
  CollaboratorPresence,
} from "@papyrus/core/collaboration-types";
import type {
  CellFormat,
  PersistedCellRecord,
  SheetColumn,
  SheetMeta,
  WorkbookMeta,
} from "@papyrus/core/workbook-types";
import type { StoreApi } from "zustand";

export type HydrationState = "error" | "idle" | "loading" | "ready";

export type RemoteSyncStatus =
  | "disabled"
  | "error"
  | "idle"
  | "pending"
  | "syncing"
  | "synced";

export type SaveState = "error" | "saved" | "saving";

export interface SpreadsheetStoreState {
  activeSheetCells: Record<string, PersistedCellRecord>;
  activeSheetColumns: SheetColumn[];
  activeSheetFormats: Record<string, CellFormat>;
  activeSheetId: string | null;
  activeSheetRowHeights: Record<string, number>;
  activeWorkbook: WorkbookMeta | null;
  canRedo: boolean;
  canUndo: boolean;
  collaborationAccessRole: CollaborationAccessRole | null;
  collaborationErrorMessage: string | null;
  collaborationPeers: CollaboratorPresence[];
  collaborationStatus: "connected" | "connecting" | "disconnected";
  connectRealtime: (
    accessRole: CollaborationAccessRole,
    identity: CollaboratorIdentity,
    serverUrl: string,
    isSharedSession: boolean,
    workbookId: string
  ) => void;
  createSheet: () => Promise<void>;
  createWorkbook: () => Promise<void>;
  deleteColumns: (startColumn: number, columnCount: number) => Promise<void>;
  deleteRows: (startRow: number, rowCount: number) => Promise<void>;
  deleteWorkbook: () => Promise<void>;
  hydrateWorkbookList: () => Promise<void>;
  hydrationState: HydrationState;
  isRemoteSyncAuthenticated: boolean;
  lastSyncErrorMessage: string | null;
  lastSyncedAt: number | null;
  manualSyncCooldownUntil: number;
  openWorkbook: (
    workbookId: string,
    name?: string,
    isSharedSession?: boolean
  ) => Promise<void>;
  redo: () => Promise<void>;
  remoteSyncStatus: RemoteSyncStatus;
  remoteVersion: number | null;
  renameColumn: (columnIndex: number, columnName: string) => Promise<boolean>;
  renameWorkbook: (name: string) => Promise<void>;
  reorderColumn: (
    sourceColumnIndex: number,
    targetColumnIndex: number
  ) => Promise<void>;
  reorderRow: (sourceRowIndex: number, targetRowIndex: number) => Promise<void>;
  resizeColumn: (columnIndex: number, width: number) => Promise<void>;
  resizeRow: (rowIndex: number, height: number) => Promise<void>;
  saveState: SaveState;
  setActiveSheet: (sheetId: string) => Promise<void>;
  setCellFormats: (values: Record<string, CellFormat | null>) => Promise<void>;
  setCellValue: (row: number, col: number, raw: string) => Promise<void>;
  setCellValuesByKey: (values: Record<string, string>) => Promise<void>;
  setWorkbookFavorite: (isFavorite: boolean) => Promise<void>;
  setWorkbookSharingAccessRole: (
    accessRole: CollaborationAccessRole
  ) => Promise<boolean>;
  setWorkbookSharingEnabled: (sharingEnabled: boolean) => Promise<boolean>;
  sheets: SheetMeta[];
  stopRealtime: () => void;
  syncNow: () => Promise<boolean>;
  undo: () => Promise<void>;
  updateRealtimePresence: (
    activeCell: { col: number; row: number } | null
  ) => void;
  updateRealtimeTyping: (typing: {
    cell: { col: number; row: number } | null;
    draft: string | null;
    sheetId: string | null;
  }) => void;
  workbooks: WorkbookMeta[];
  workerResetKey: string;
}

export type SpreadsheetStoreGetState =
  StoreApi<SpreadsheetStoreState>["getState"];

export type SpreadsheetStoreSetState =
  StoreApi<SpreadsheetStoreState>["setState"];
