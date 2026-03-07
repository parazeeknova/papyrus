"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCellReferenceLabel as buildCellReferenceLabel,
  cellId,
  getColumnName as resolveColumnName,
} from "@/web/features/spreadsheet/lib/spreadsheet-engine";
import type {
  CellData,
  CellPosition,
  SelectionMode,
  SelectionRange,
  SpreadsheetPatch,
  SpreadsheetWorkerResponse,
} from "@/web/features/spreadsheet/lib/spreadsheet-types";
import { useSpreadsheetStore } from "@/web/features/spreadsheet/store/spreadsheet-store";

// biome-ignore lint/performance/noBarrelFile: skip re-exporting from index for better path clarity
export { cellId } from "@/web/features/spreadsheet/lib/spreadsheet-engine";

export type {
  CellData,
  CellPosition,
  SelectionMode,
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
  const activeSheetCells = useSpreadsheetStore(
    (state) => state.activeSheetCells
  );
  const activeSheetColumns = useSpreadsheetStore(
    (state) => state.activeSheetColumns
  );
  const activeSheetId = useSpreadsheetStore((state) => state.activeSheetId);
  const activeWorkbook = useSpreadsheetStore((state) => state.activeWorkbook);
  const createSheet = useSpreadsheetStore((state) => state.createSheet);
  const createWorkbook = useSpreadsheetStore((state) => state.createWorkbook);
  const deleteWorkbook = useSpreadsheetStore((state) => state.deleteWorkbook);
  const hydrationState = useSpreadsheetStore((state) => state.hydrationState);
  const hydrateWorkbookList = useSpreadsheetStore(
    (state) => state.hydrateWorkbookList
  );
  const openWorkbook = useSpreadsheetStore((state) => state.openWorkbook);
  const renameColumn = useSpreadsheetStore((state) => state.renameColumn);
  const renameWorkbook = useSpreadsheetStore((state) => state.renameWorkbook);
  const saveState = useSpreadsheetStore((state) => state.saveState);
  const setActiveSheet = useSpreadsheetStore((state) => state.setActiveSheet);
  const setPersistedCellValue = useSpreadsheetStore(
    (state) => state.setCellValue
  );
  const setWorkbookFavorite = useSpreadsheetStore(
    (state) => state.setWorkbookFavorite
  );
  const sheets = useSpreadsheetStore((state) => state.sheets);
  const workbooks = useSpreadsheetStore((state) => state.workbooks);
  const workerResetKey = useSpreadsheetStore((state) => state.workerResetKey);
  const [activeCell, setActiveCell] = useState<CellPosition | null>(null);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [computedCells, setComputedCells] = useState<Record<string, CellData>>(
    {}
  );
  const activeColumnNames = useMemo(
    () => activeSheetColumns.map((column) => column.name),
    [activeSheetColumns]
  );
  const columnCount = activeColumnNames.length || DEFAULT_COLS;
  const [totalRowCount] = useState(DEFAULT_ROWS);
  const [rowCount, setRowCount] = useState(DEFAULT_VISIBLE_ROWS);

  const workerRef = useRef<Worker | null>(null);
  const workerCellsRef = useRef<Record<string, CellData>>({});
  const workerColumnNamesRef = useRef<string[]>([]);
  const activeSheetCellsForWorker = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(activeSheetCells).map(([cellKey, cellData]) => [
          cellKey,
          {
            raw: cellData.raw,
            computed: cellData.raw,
          },
        ])
      ),
    [activeSheetCells]
  );

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
        setComputedCells((prev) =>
          applySpreadsheetPatch(prev, e.data.payload.patch)
        );
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    hydrateWorkbookList().catch(() => undefined);
  }, [hydrateWorkbookList]);

  useEffect(() => {
    workerCellsRef.current = activeSheetCellsForWorker;
  }, [activeSheetCellsForWorker]);

  useEffect(() => {
    workerColumnNamesRef.current = activeColumnNames;
  }, [activeColumnNames]);

  useEffect(() => {
    if (workerResetKey.length === 0) {
      return;
    }

    setComputedCells({});
    workerRef.current?.postMessage({
      type: "INIT",
      payload: {
        cells: workerCellsRef.current,
        columnNames: workerColumnNamesRef.current,
      },
    });
    setActiveCell(null);
    setEditingCell(null);
    setSelection(null);
  }, [workerResetKey]);

  const getCellData = useCallback(
    (row: number, col: number): CellData => {
      const id = cellId(row, col);
      const computedCell = computedCells[id];
      if (computedCell) {
        return computedCell;
      }

      const persistedCell = activeSheetCells[id];
      if (!persistedCell) {
        return EMPTY_CELL;
      }

      return {
        computed: persistedCell.raw,
        raw: persistedCell.raw,
      };
    },
    [activeSheetCells, computedCells]
  );

  const setCellValue = useCallback(
    (row: number, col: number, raw: string) => {
      setPersistedCellValue(row, col, raw).catch(() => undefined);

      workerRef.current?.postMessage({
        type: "UPDATE_CELL",
        payload: { row, col, raw },
      });
    },
    [setPersistedCellValue]
  );

  const setSelectionRange = useCallback(
    (start: CellPosition, end: CellPosition, mode: SelectionMode = "cells") => {
      const nextStart = {
        row: Math.max(0, Math.min(rowCount - 1, start.row)),
        col: Math.max(0, Math.min(columnCount - 1, start.col)),
      };
      const nextEnd = {
        row: Math.max(0, Math.min(rowCount - 1, end.row)),
        col: Math.max(0, Math.min(columnCount - 1, end.col)),
      };

      setSelection({ start: nextStart, end: nextEnd, mode });
      setEditingCell(null);

      if (mode === "rows") {
        setActiveCell({ row: nextStart.row, col: 0 });
        return;
      }

      if (mode === "columns") {
        setActiveCell({ row: 0, col: nextStart.col });
        return;
      }

      setActiveCell(nextStart);
    },
    [columnCount, rowCount]
  );

  const selectCell = useCallback((pos: CellPosition | null) => {
    setActiveCell(pos);
    setSelection(pos ? { start: pos, end: pos, mode: "cells" } : null);
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
    activeCell,
    activeSheetColumns,
    activeSheetId,
    activeWorkbook,
    createSheet,
    createWorkbook,
    deleteWorkbook,
    editingCell,
    selection,
    canExpandRows,
    columnCount,
    expandRowCount,
    hydrationState,
    openWorkbook,
    renameColumn,
    renameWorkbook,
    rowCount,
    saveState,
    sheets,
    setSelectionRange,
    totalRowCount,
    getCellData,
    setCellValue,
    selectCell,
    setActiveSheet,
    setWorkbookFavorite,
    showAllRows,
    startEditing,
    stopEditing,
    navigateFromActive,
    workbooks,
    getColumnName: (col: number) => resolveColumnName(activeColumnNames, col),
    getCellReferenceLabel: (row: number, col: number) =>
      buildCellReferenceLabel(row, col, activeColumnNames),
  };
}
