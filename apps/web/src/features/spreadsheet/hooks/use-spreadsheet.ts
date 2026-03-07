"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCellReferenceLabel as buildCellReferenceLabel,
  cellId,
  parseStoredCellId,
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

interface SelectionBounds {
  endCol: number;
  endRow: number;
  mode: SelectionMode;
  startCol: number;
  startRow: number;
}

interface ClipboardPayload {
  matrix: string[][];
}

function normalizeSelectionRange(
  selection: SelectionRange | null,
  columnCount: number,
  rowCount: number
): SelectionBounds | null {
  if (!selection) {
    return null;
  }

  const minRow = Math.min(selection.start.row, selection.end.row);
  const maxRow = Math.max(selection.start.row, selection.end.row);
  const minCol = Math.min(selection.start.col, selection.end.col);
  const maxCol = Math.max(selection.start.col, selection.end.col);

  if (selection.mode === "rows") {
    return {
      endCol: columnCount - 1,
      endRow: maxRow,
      mode: selection.mode,
      startCol: 0,
      startRow: minRow,
    };
  }

  if (selection.mode === "columns") {
    return {
      endCol: maxCol,
      endRow: rowCount - 1,
      mode: selection.mode,
      startCol: minCol,
      startRow: 0,
    };
  }

  return {
    endCol: maxCol,
    endRow: maxRow,
    mode: selection.mode,
    startCol: minCol,
    startRow: minRow,
  };
}

function serializeClipboardMatrix(matrix: string[][]): string {
  return matrix.map((row) => row.join("\t")).join("\n");
}

function parseClipboardText(text: string): string[][] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((row) => row.split("\t"));
}

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  return (
    target.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT"
  );
}

function matchesQuery(
  value: string,
  query: string,
  caseSensitive: boolean
): boolean {
  if (query.length === 0) {
    return false;
  }

  if (caseSensitive) {
    return value.includes(query);
  }

  return value.toLowerCase().includes(query.toLowerCase());
}

function replaceFirstOccurrence(
  value: string,
  query: string,
  replacement: string,
  caseSensitive: boolean
): string {
  if (query.length === 0) {
    return value;
  }

  if (caseSensitive) {
    return value.replace(query, replacement);
  }

  const queryIndex = value.toLowerCase().indexOf(query.toLowerCase());
  if (queryIndex < 0) {
    return value;
  }

  return `${value.slice(0, queryIndex)}${replacement}${value.slice(
    queryIndex + query.length
  )}`;
}

function replaceAllOccurrences(
  value: string,
  query: string,
  replacement: string,
  caseSensitive: boolean
): string {
  if (query.length === 0) {
    return value;
  }

  if (caseSensitive) {
    return value.split(query).join(replacement);
  }

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(new RegExp(escapedQuery, "gi"), replacement);
}

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
  const canRedo = useSpreadsheetStore((state) => state.canRedo);
  const canUndo = useSpreadsheetStore((state) => state.canUndo);
  const createSheet = useSpreadsheetStore((state) => state.createSheet);
  const createWorkbook = useSpreadsheetStore((state) => state.createWorkbook);
  const deleteColumns = useSpreadsheetStore((state) => state.deleteColumns);
  const deleteRows = useSpreadsheetStore((state) => state.deleteRows);
  const deleteWorkbook = useSpreadsheetStore((state) => state.deleteWorkbook);
  const hydrationState = useSpreadsheetStore((state) => state.hydrationState);
  const isRemoteSyncAuthenticated = useSpreadsheetStore(
    (state) => state.isRemoteSyncAuthenticated
  );
  const manualSyncCooldownUntil = useSpreadsheetStore(
    (state) => state.manualSyncCooldownUntil
  );
  const hydrateWorkbookList = useSpreadsheetStore(
    (state) => state.hydrateWorkbookList
  );
  const openWorkbook = useSpreadsheetStore((state) => state.openWorkbook);
  const renameColumn = useSpreadsheetStore((state) => state.renameColumn);
  const renameWorkbook = useSpreadsheetStore((state) => state.renameWorkbook);
  const redo = useSpreadsheetStore((state) => state.redo);
  const saveState = useSpreadsheetStore((state) => state.saveState);
  const setActiveSheet = useSpreadsheetStore((state) => state.setActiveSheet);
  const setCellValuesByKey = useSpreadsheetStore(
    (state) => state.setCellValuesByKey
  );
  const setPersistedCellValue = useSpreadsheetStore(
    (state) => state.setCellValue
  );
  const setWorkbookFavorite = useSpreadsheetStore(
    (state) => state.setWorkbookFavorite
  );
  const sheets = useSpreadsheetStore((state) => state.sheets);
  const syncNow = useSpreadsheetStore((state) => state.syncNow);
  const undo = useSpreadsheetStore((state) => state.undo);
  const workbooks = useSpreadsheetStore((state) => state.workbooks);
  const workerResetKey = useSpreadsheetStore((state) => state.workerResetKey);
  const [activeCell, setActiveCell] = useState<CellPosition | null>(null);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [computedCells, setComputedCells] = useState<Record<string, CellData>>(
    {}
  );
  const [now, setNow] = useState(() => Date.now());
  const activeColumnNames = useMemo(
    () => activeSheetColumns.map((column) => column.name),
    [activeSheetColumns]
  );
  const columnCount = activeColumnNames.length || DEFAULT_COLS;
  const [totalRowCount] = useState(DEFAULT_ROWS);
  const [rowCount, setRowCount] = useState(DEFAULT_VISIBLE_ROWS);

  const workerRef = useRef<Worker | null>(null);
  const workerCellsRef = useRef<Record<string, CellData>>({});
  const clipboardRef = useRef<ClipboardPayload | null>(null);
  const workerColumnNamesRef = useRef<string[]>([]);
  const normalizedSelection = useMemo(
    () => normalizeSelectionRange(selection, columnCount, rowCount),
    [selection, columnCount, rowCount]
  );
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
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

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

  const selectCell = useCallback((pos: CellPosition | null) => {
    setActiveCell(pos);
    setSelection(pos ? { start: pos, end: pos, mode: "cells" } : null);
    setEditingCell(null);
  }, []);

  const getRawCellValue = useCallback(
    (row: number, col: number): string => {
      return activeSheetCells[cellId(row, col)]?.raw ?? "";
    },
    [activeSheetCells]
  );

  const getSelectionBounds = useCallback((): SelectionBounds | null => {
    if (normalizedSelection) {
      return normalizedSelection;
    }

    if (!activeCell) {
      return null;
    }

    return {
      endCol: activeCell.col,
      endRow: activeCell.row,
      mode: "cells",
      startCol: activeCell.col,
      startRow: activeCell.row,
    };
  }, [activeCell, normalizedSelection]);

  const copySelection = useCallback(async (): Promise<boolean> => {
    const bounds = getSelectionBounds();
    if (!bounds) {
      return false;
    }

    const matrix: string[][] = [];
    for (let row = bounds.startRow; row <= bounds.endRow; row++) {
      const nextRow: string[] = [];
      for (let col = bounds.startCol; col <= bounds.endCol; col++) {
        nextRow.push(getRawCellValue(row, col));
      }
      matrix.push(nextRow);
    }

    clipboardRef.current = { matrix };
    const clipboardText = serializeClipboardMatrix(matrix);

    try {
      await navigator.clipboard.writeText(clipboardText);
    } catch {
      return true;
    }

    return true;
  }, [getRawCellValue, getSelectionBounds]);

  const cutSelection = useCallback(async (): Promise<boolean> => {
    const bounds = getSelectionBounds();
    if (!bounds) {
      return false;
    }

    const didCopy = await copySelection();
    if (!didCopy) {
      return false;
    }

    const nextValues: Record<string, string> = {};
    for (let row = bounds.startRow; row <= bounds.endRow; row++) {
      for (let col = bounds.startCol; col <= bounds.endCol; col++) {
        nextValues[cellId(row, col)] = "";
      }
    }

    await setCellValuesByKey(nextValues);
    return true;
  }, [copySelection, getSelectionBounds, setCellValuesByKey]);

  const pasteSelection = useCallback(async (): Promise<boolean> => {
    const targetCell =
      activeCell ??
      (normalizedSelection
        ? {
            col: normalizedSelection.startCol,
            row: normalizedSelection.startRow,
          }
        : null);
    if (!targetCell) {
      return false;
    }

    let matrix = clipboardRef.current?.matrix ?? [];
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText.trim().length > 0) {
        matrix = parseClipboardText(clipboardText);
      }
    } catch {
      // Fall back to the in-memory clipboard when browser clipboard access is unavailable.
    }

    if (matrix.length === 0) {
      return false;
    }

    const nextValues: Record<string, string> = {};
    for (const [rowOffset, rowValues] of matrix.entries()) {
      for (const [colOffset, raw] of rowValues.entries()) {
        nextValues[
          cellId(targetCell.row + rowOffset, targetCell.col + colOffset)
        ] = raw;
      }
    }

    await setCellValuesByKey(nextValues);
    return true;
  }, [activeCell, normalizedSelection, setCellValuesByKey]);

  const deleteSelectedRows = useCallback(async (): Promise<boolean> => {
    if (normalizedSelection?.mode === "rows") {
      await deleteRows(
        normalizedSelection.startRow,
        normalizedSelection.endRow - normalizedSelection.startRow + 1
      );
      selectCell({
        col: 0,
        row: normalizedSelection.startRow,
      });
      return true;
    }

    if (!activeCell) {
      return false;
    }

    await deleteRows(activeCell.row, 1);
    selectCell({ col: activeCell.col, row: Math.max(0, activeCell.row - 1) });
    return true;
  }, [activeCell, deleteRows, normalizedSelection, selectCell]);

  const deleteSelectedColumns = useCallback(async (): Promise<boolean> => {
    if (normalizedSelection?.mode === "columns") {
      await deleteColumns(
        normalizedSelection.startCol,
        normalizedSelection.endCol - normalizedSelection.startCol + 1
      );
      selectCell({
        col: normalizedSelection.startCol,
        row: 0,
      });
      return true;
    }

    if (!activeCell) {
      return false;
    }

    await deleteColumns(activeCell.col, 1);
    selectCell({ col: Math.max(0, activeCell.col - 1), row: activeCell.row });
    return true;
  }, [activeCell, deleteColumns, normalizedSelection, selectCell]);

  const findNext = useCallback(
    (query: string, caseSensitive = false): boolean => {
      if (query.trim().length === 0) {
        return false;
      }

      const sortedCells = Object.entries(activeSheetCells)
        .map(([cellKey, cellValue]) => {
          const position = parseStoredCellId(cellKey);
          if (!position) {
            return null;
          }

          return {
            ...position,
            raw: cellValue.raw,
          };
        })
        .filter((entry): entry is { col: number; raw: string; row: number } => {
          return entry !== null;
        })
        .sort((left, right) => {
          if (left.row !== right.row) {
            return left.row - right.row;
          }

          return left.col - right.col;
        });

      if (sortedCells.length === 0) {
        return false;
      }

      const startIndex = activeCell
        ? sortedCells.findIndex(
            (entry) =>
              entry.row > activeCell.row ||
              (entry.row === activeCell.row && entry.col > activeCell.col)
          )
        : 0;

      const orderedCells =
        startIndex <= 0
          ? sortedCells
          : [
              ...sortedCells.slice(startIndex),
              ...sortedCells.slice(0, startIndex),
            ];

      const nextMatch = orderedCells.find((entry) =>
        matchesQuery(entry.raw, query, caseSensitive)
      );
      if (!nextMatch) {
        return false;
      }

      selectCell({ col: nextMatch.col, row: nextMatch.row });
      return true;
    },
    [activeCell, activeSheetCells, selectCell]
  );

  const replaceCurrent = useCallback(
    async (
      query: string,
      replacement: string,
      caseSensitive = false
    ): Promise<boolean> => {
      if (!(activeCell && query.trim().length > 0)) {
        return false;
      }

      const currentRaw = getRawCellValue(activeCell.row, activeCell.col);
      if (!matchesQuery(currentRaw, query, caseSensitive)) {
        return findNext(query, caseSensitive);
      }

      const nextRaw = replaceFirstOccurrence(
        currentRaw,
        query,
        replacement,
        caseSensitive
      );
      await setCellValuesByKey({
        [cellId(activeCell.row, activeCell.col)]: nextRaw,
      });
      return true;
    },
    [activeCell, findNext, getRawCellValue, setCellValuesByKey]
  );

  const replaceAll = useCallback(
    async (
      query: string,
      replacement: string,
      caseSensitive = false
    ): Promise<number> => {
      if (query.trim().length === 0) {
        return 0;
      }

      const nextValues: Record<string, string> = {};
      let replacementCount = 0;

      for (const [storedCellKey, cellValue] of Object.entries(
        activeSheetCells
      )) {
        if (!matchesQuery(cellValue.raw, query, caseSensitive)) {
          continue;
        }

        const nextRaw = replaceAllOccurrences(
          cellValue.raw,
          query,
          replacement,
          caseSensitive
        );

        if (nextRaw === cellValue.raw) {
          continue;
        }

        replacementCount++;
        nextValues[storedCellKey] = nextRaw;
      }

      if (replacementCount === 0) {
        return 0;
      }

      await setCellValuesByKey(nextValues);
      return replacementCount;
    },
    [activeSheetCells, setCellValuesByKey]
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
  const canManualSync =
    isRemoteSyncAuthenticated && now >= manualSyncCooldownUntil;

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextInputTarget(event.target)) {
        return;
      }

      const isPrimaryModifier = event.metaKey || event.ctrlKey;
      if (!isPrimaryModifier) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo().catch(() => undefined);
        return;
      }

      if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        redo().catch(() => undefined);
        return;
      }

      if (key === "c") {
        event.preventDefault();
        copySelection().catch(() => undefined);
        return;
      }

      if (key === "x") {
        event.preventDefault();
        cutSelection().catch(() => undefined);
        return;
      }

      if (key === "v") {
        event.preventDefault();
        pasteSelection().catch(() => undefined);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [copySelection, cutSelection, pasteSelection, redo, undo]);

  return {
    activeCell,
    activeSheetColumns,
    activeSheetId,
    activeWorkbook,
    canRedo,
    canUndo,
    createSheet,
    createWorkbook,
    canManualSync,
    copySelection,
    cutSelection,
    deleteSelectedColumns,
    deleteSelectedRows,
    deleteWorkbook,
    editingCell,
    selection,
    canExpandRows,
    columnCount,
    expandRowCount,
    hydrationState,
    findNext,
    openWorkbook,
    pasteSelection,
    redo,
    renameColumn,
    renameWorkbook,
    replaceAll,
    replaceCurrent,
    rowCount,
    saveState,
    sheets,
    syncNow,
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
    undo,
    navigateFromActive,
    workbooks,
    getColumnName: (col: number) => resolveColumnName(activeColumnNames, col),
    getCellReferenceLabel: (row: number, col: number) =>
      buildCellReferenceLabel(row, col, activeColumnNames),
  };
}
