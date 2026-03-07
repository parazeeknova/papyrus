export type SelectionMode = "cells" | "columns" | "rows";

export interface CellData {
  computed: string;
  raw: string;
}

export interface CellPosition {
  col: number;
  row: number;
}

export interface SelectionRange {
  end: CellPosition;
  mode: SelectionMode;
  start: CellPosition;
}

export interface SpreadsheetState {
  activeCell: CellPosition | null;
  cells: Record<string, CellData>;
  columnCount: number;
  editingCell: CellPosition | null;
  rowCount: number;
  selection: SelectionRange | null;
}

export interface SpreadsheetPatch {
  deletions: string[];
  updates: Record<string, CellData>;
}

export type SpreadsheetWorkerMessage =
  | {
      type: "INIT";
      payload: {
        cells?: Record<string, CellData>;
      };
    }
  | {
      type: "UPDATE_CELL";
      payload: { col: number; raw: string; row: number };
    };

export type SpreadsheetWorkerResponse =
  | {
      type: "READY";
      payload: {
        patch: SpreadsheetPatch;
      };
    }
  | {
      type: "CELLS_PATCH";
      payload: {
        patch: SpreadsheetPatch;
      };
    };
