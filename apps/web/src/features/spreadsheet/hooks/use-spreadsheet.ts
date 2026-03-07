"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cellId } from "@/web/features/spreadsheet/lib/spreadsheet-engine";
import type {
  CellData,
  CellPosition,
  SelectionRange,
  SpreadsheetPatch,
  SpreadsheetWorkerResponse,
} from "@/web/features/spreadsheet/lib/spreadsheet-types";

// biome-ignore lint/performance/noBarrelFile: skip re-exporting from index for better path clarity
export {
  cellId,
  colToLetter,
  parseCellRef,
} from "@/web/features/spreadsheet/lib/spreadsheet-engine";

export type {
  CellData,
  CellPosition,
  SelectionRange,
  SpreadsheetState,
} from "@/web/features/spreadsheet/lib/spreadsheet-types";

const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 100_000;
const DEFAULT_VISIBLE_ROWS = 1000;
const ROW_EXPANSION_STEP = 1000;
const EMPTY_CELL: CellData = { raw: "", computed: "" };

const applySpreadsheetPatch = (
  prev: Record<string, CellData>,
  patch: SpreadsheetPatch
): Record<string, CellData> => {
  if (patch.deletions.length === 0 && Object.keys(patch.updates).length === 0) {
    return prev;
  }

  const next = { ...prev };
  for (const cellKey of patch.deletions) {
    delete next[cellKey];
  }

  for (const [cellKey, cellData] of Object.entries(patch.updates)) {
    next[cellKey] = cellData;
  }

  return next;
};

export function useSpreadsheet() {
  const [cells, setCells] = useState<Record<string, CellData>>({});
  const [activeCell, setActiveCell] = useState<CellPosition | null>(null);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [columnCount] = useState(DEFAULT_COLS);
  const [totalRowCount] = useState(DEFAULT_ROWS);
  const [rowCount, setRowCount] = useState(DEFAULT_VISIBLE_ROWS);

  const workerRef = useRef<Worker | null>(null);

  // Initialize Worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL(
        "@/web/features/spreadsheet/lib/spreadsheet.worker.ts",
        import.meta.url
      )
    );
    workerRef.current.onmessage = (
      e: MessageEvent<SpreadsheetWorkerResponse>
    ) => {
      if (e.data.type === "READY" || e.data.type === "CELLS_PATCH") {
        setCells((prev) => applySpreadsheetPatch(prev, e.data.payload.patch));
      }
    };

    workerRef.current.postMessage({ type: "INIT", payload: { cells: {} } });

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const getCellData = useCallback(
    (row: number, col: number): CellData => {
      const id = cellId(row, col);
      return cells[id] ?? EMPTY_CELL;
    },
    [cells]
  );

  const setCellValue = useCallback((row: number, col: number, raw: string) => {
    setCells((prev) => {
      const id = cellId(row, col);
      if (raw === "") {
        if (!(id in prev)) {
          return prev;
        }

        const next = { ...prev };
        delete next[id];
        return next;
      }

      return {
        ...prev,
        [id]: { raw, computed: raw.startsWith("=") ? "..." : raw },
      };
    });

    workerRef.current?.postMessage({
      type: "UPDATE_CELL",
      payload: { row, col, raw },
    });
  }, []);

  const selectCell = useCallback((pos: CellPosition | null) => {
    setActiveCell(pos);
    setSelection(pos ? { start: pos, end: pos } : null);
    setEditingCell(null);
  }, []);

  const startEditing = useCallback((pos: CellPosition) => {
    setActiveCell(pos);
    setEditingCell(pos);
  }, []);

  const stopEditing = useCallback(() => {
    setEditingCell(null);
  }, []);

  const expandRowCount = useCallback(() => {
    setRowCount((prev) => Math.min(totalRowCount, prev + ROW_EXPANSION_STEP));
  }, [totalRowCount]);

  const showAllRows = useCallback(() => {
    setRowCount(totalRowCount);
  }, [totalRowCount]);

  const canExpandRows = rowCount < totalRowCount;

  const navigateFromActive = useCallback(
    (direction: "up" | "down" | "left" | "right"): CellPosition | null => {
      if (!activeCell) {
        return null;
      }
      let { row, col } = activeCell;
      switch (direction) {
        case "up":
          row = Math.max(0, row - 1);
          break;
        case "down":
          row = Math.min(rowCount - 1, row + 1);
          break;
        case "left":
          col = Math.max(0, col - 1);
          break;
        case "right":
          col = Math.min(columnCount - 1, col + 1);
          break;
        default:
          break;
      }
      const newPos = { row, col };
      selectCell(newPos);
      return newPos;
    },
    [activeCell, rowCount, columnCount, selectCell]
  );

  return {
    cells,
    activeCell,
    editingCell,
    selection,
    canExpandRows,
    columnCount,
    expandRowCount,
    rowCount,
    totalRowCount,
    getCellData,
    setCellValue,
    selectCell,
    showAllRows,
    startEditing,
    stopEditing,
    navigateFromActive,
  };
}
