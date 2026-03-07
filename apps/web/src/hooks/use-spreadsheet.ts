"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cellId } from "@/web/lib/spreadsheet-engine";

// biome-ignore lint/performance/noBarrelFile: skip re-exporting from index for better path clarity
export {
  cellId,
  colToLetter,
  parseCellRef,
} from "@/web/lib/spreadsheet-engine";

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

const DEFAULT_COLS = 26;
const DEFAULT_ROWS = 1000;

export function useSpreadsheet() {
  const [cells, setCells] = useState<Record<string, CellData>>({});
  const [activeCell, setActiveCell] = useState<CellPosition | null>(null);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [columnCount] = useState(DEFAULT_COLS);
  const [rowCount] = useState(DEFAULT_ROWS);

  const workerRef = useRef<Worker | null>(null);

  // Initialize Worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL("@/web/lib/spreadsheet.worker.ts", import.meta.url)
    );
    workerRef.current.onmessage = (e: MessageEvent) => {
      if (e.data.type === "STATE_UPDATE") {
        setCells(e.data.payload);
      }
    };

    workerRef.current.postMessage({ type: "INIT", payload: {} });

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const getCellData = useCallback(
    (row: number, col: number): CellData => {
      const id = cellId(row, col);
      return cells[id] ?? { raw: "", computed: "" };
    },
    [cells]
  );

  const setCellValue = useCallback((row: number, col: number, raw: string) => {
    // Optimistic local update so typing feels instant
    setCells((prev) => {
      const id = cellId(row, col);
      return {
        ...prev,
        [id]: { raw, computed: raw.startsWith("=") ? "..." : raw },
      };
    });

    // Offload true calculation to worker
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
    columnCount,
    rowCount,
    getCellData,
    setCellValue,
    selectCell,
    startEditing,
    stopEditing,
    navigateFromActive,
  };
}
