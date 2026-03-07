import type { CollaborationAccessRole } from "./collaboration-types";

export interface PersistedCellRecord {
  raw: string;
}

export interface SheetColumn {
  index: number;
  name: string;
}

export interface SheetMeta {
  createdAt: string;
  id: string;
  name: string;
  updatedAt: string;
}

export interface WorkbookMeta {
  createdAt: string;
  id: string;
  isFavorite: boolean;
  lastOpenedAt: string;
  lastSyncedAt?: string | null;
  name: string;
  remoteVersion?: number | null;
  sharingAccessRole: CollaborationAccessRole;
  sharingEnabled: boolean;
  updatedAt: string;
}

export interface WorkbookSnapshot {
  activeSheetCells: Record<string, PersistedCellRecord>;
  activeSheetColumns: SheetColumn[];
  activeSheetId: string | null;
  sheets: SheetMeta[];
  workbook: WorkbookMeta;
}
