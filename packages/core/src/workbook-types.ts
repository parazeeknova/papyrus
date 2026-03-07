export interface PersistedCellRecord {
  raw: string;
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
  name: string;
  updatedAt: string;
}

export interface WorkbookSnapshot {
  activeSheetCells: Record<string, PersistedCellRecord>;
  activeSheetId: string | null;
  sheets: SheetMeta[];
  workbook: WorkbookMeta;
}
