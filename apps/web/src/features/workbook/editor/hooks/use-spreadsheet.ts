"use client";

import type { CollaborationAccessRole } from "@papyrus/core/collaboration-types";
import type {
  CellFormat,
  CellTextTransform,
  PersistedCellRecord,
} from "@papyrus/core/workbook-types";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SHARING_BACKEND_READY } from "@/web/features/workbook/collaboration/lib/collaboration";
import {
  getCellReferenceLabel as buildCellReferenceLabel,
  cellId,
  parseStoredCellId,
  getColumnName as resolveColumnName,
} from "@/web/features/workbook/editor/lib/spreadsheet-engine";
import type {
  CellData,
  CellPosition,
  SelectionMode,
  SelectionRange,
  SpreadsheetPatch,
  SpreadsheetWorkerResponse,
} from "@/web/features/workbook/editor/lib/spreadsheet-types";
import { useWorkbookStore } from "@/web/features/workbook/store/workbook-store";
import { firebaseAuth } from "@/web/platform/firebase/client";

// biome-ignore lint/performance/noBarrelFile: skip re-exporting from index for better path clarity
export { cellId } from "@/web/features/workbook/editor/lib/spreadsheet-engine";

export type {
  CellData,
  CellPosition,
  SelectionMode,
  SelectionRange,
  SpreadsheetState,
} from "@/web/features/workbook/editor/lib/spreadsheet-types";

const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 100_000;
const DEFAULT_VISIBLE_ROWS = 1000;
const ROW_EXPANSION_STEP = 1000;
const SELECTION_OPERATION_STATUS_VISIBILITY_DELAY_MS = 150;
const SHEET_STATUS_VISIBILITY_DELAY_MS = 150;
const WORKER_INIT_SYNC_DELAY_MS = 180;
const EMPTY_CELL: CellData = { raw: "", computed: "" };
const EMPTY_CELL_FORMAT: CellFormat = {};
const LAST_SYNC_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const SORT_VALUE_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

type CellFormatFlag = "bold" | "italic" | "strikethrough" | "underline";

function formatRelativeSyncTime(timestamp: number, now: number): string {
  const diffMs = Math.max(0, now - timestamp);
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 10) {
    return "just now";
  }

  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return LAST_SYNC_TIME_FORMATTER.format(new Date(timestamp));
}

interface SelectionBounds {
  endCol: number;
  endRow: number;
  mode: SelectionMode;
  startCol: number;
  startRow: number;
}

interface SortBounds {
  endCol: number;
  endRow: number;
  startCol: number;
  startRow: number;
}

interface ClipboardPayload {
  matrix: string[][];
}

interface SheetFooterSheetSummary {
  filledCellCount: number;
  populatedColumnCount: number;
  populatedRowCount: number;
  totalColumnCount: number;
  totalRowCount: number;
}

interface SheetFooterSelectionSummary {
  average: number | null;
  filledCellCount: number;
  numericCellCount: number;
  selectedCellCount: number;
  sum: number | null;
}

interface UseSpreadsheetOptions {
  isSharedSession?: boolean;
  requestedAccessRole?: CollaborationAccessRole | null;
  workbookId?: string | null;
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

function getRequiredVisibleRowCount(
  cells: Record<string, { raw: string }>
): number {
  let largestRowIndex = -1;

  for (const [cellKey, cell] of Object.entries(cells)) {
    if (cell.raw === "") {
      continue;
    }

    const position = parseStoredCellId(cellKey);
    if (!position) {
      continue;
    }

    largestRowIndex = Math.max(largestRowIndex, position.row);
  }

  return Math.max(DEFAULT_VISIBLE_ROWS, largestRowIndex + 1);
}

function getUsedSortBounds(
  cells: Record<string, { raw: string }>,
  formats: Record<string, CellFormat>,
  columnCount: number,
  minimumColumnIndex = 0
): SortBounds | null {
  let maxCol = Math.max(0, minimumColumnIndex);
  let maxRow = -1;
  let minCol = minimumColumnIndex;
  let minRow = Number.POSITIVE_INFINITY;

  for (const [cellKey, cell] of Object.entries(cells)) {
    if (cell.raw === "") {
      continue;
    }

    const position = parseStoredCellId(cellKey);
    if (!position) {
      continue;
    }

    maxCol = Math.max(maxCol, position.col);
    maxRow = Math.max(maxRow, position.row);
    minCol = Math.min(minCol, position.col);
    minRow = Math.min(minRow, position.row);
  }

  for (const cellKey of Object.keys(formats)) {
    const position = parseStoredCellId(cellKey);
    if (!position) {
      continue;
    }

    maxCol = Math.max(maxCol, position.col);
    maxRow = Math.max(maxRow, position.row);
    minCol = Math.min(minCol, position.col);
    minRow = Math.min(minRow, position.row);
  }

  if (maxRow < 0 || !Number.isFinite(minRow)) {
    return null;
  }

  return {
    endCol: Math.min(columnCount - 1, maxCol),
    endRow: maxRow,
    startCol: Math.max(0, Math.min(minCol, minimumColumnIndex)),
    startRow: Math.max(0, minRow),
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

function normalizeCellFormat(
  format: CellFormat | null | undefined
): CellFormat | null {
  if (!format) {
    return null;
  }

  const normalizedFormat: CellFormat = {};

  if (format.bold) {
    normalizedFormat.bold = true;
  }
  if (format.fontFamily?.trim()) {
    normalizedFormat.fontFamily = format.fontFamily.trim();
  }
  if (
    typeof format.fontSize === "number" &&
    Number.isFinite(format.fontSize) &&
    format.fontSize > 0
  ) {
    normalizedFormat.fontSize = format.fontSize;
  }
  if (format.italic) {
    normalizedFormat.italic = true;
  }
  if (format.strikethrough) {
    normalizedFormat.strikethrough = true;
  }
  if (format.textColor?.trim()) {
    normalizedFormat.textColor = format.textColor.trim();
  }
  if (
    format.textTransform === "lowercase" ||
    format.textTransform === "uppercase"
  ) {
    normalizedFormat.textTransform = format.textTransform;
  }
  if (format.underline) {
    normalizedFormat.underline = true;
  }

  return Object.keys(normalizedFormat).length > 0 ? normalizedFormat : null;
}

function compareCellValues(left: string, right: string): number {
  const leftTrimmed = left.trim();
  const rightTrimmed = right.trim();

  if (leftTrimmed.length === 0 && rightTrimmed.length === 0) {
    return 0;
  }

  if (leftTrimmed.length === 0) {
    return 1;
  }

  if (rightTrimmed.length === 0) {
    return -1;
  }

  const leftNumber = Number(leftTrimmed);
  const rightNumber = Number(rightTrimmed);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return SORT_VALUE_COLLATOR.compare(leftTrimmed, rightTrimmed);
}

function parseNumericCellValue(value: string): number | null {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return null;
  }

  const numericValue = Number(trimmedValue);
  return Number.isFinite(numericValue) ? numericValue : null;
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

export function useSpreadsheet({
  isSharedSession = false,
  requestedAccessRole = null,
  workbookId = null,
}: UseSpreadsheetOptions = {}) {
  const activeSheetCells = useWorkbookStore((state) => state.activeSheetCells);
  const activeSheetColumns = useWorkbookStore(
    (state) => state.activeSheetColumns
  );
  const activeSheetFormats = useWorkbookStore(
    (state) => state.activeSheetFormats
  );
  const activeSheetRowHeights = useWorkbookStore(
    (state) => state.activeSheetRowHeights
  );
  const activeSheetId = useWorkbookStore((state) => state.activeSheetId);
  const activeWorkbook = useWorkbookStore((state) => state.activeWorkbook);
  const canRedo = useWorkbookStore((state) => state.canRedo);
  const canUndo = useWorkbookStore((state) => state.canUndo);
  const collaborationAccessRole = useWorkbookStore(
    (state) => state.collaborationAccessRole
  );
  const collaborationErrorMessage = useWorkbookStore(
    (state) => state.collaborationErrorMessage
  );
  const collaborationPeers = useWorkbookStore(
    (state) => state.collaborationPeers
  );
  const collaborationStatus = useWorkbookStore(
    (state) => state.collaborationStatus
  );
  const createSheet = useWorkbookStore((state) => state.createSheet);
  const createWorkbook = useWorkbookStore((state) => state.createWorkbook);
  const deleteColumns = useWorkbookStore((state) => state.deleteColumns);
  const deleteRows = useWorkbookStore((state) => state.deleteRows);
  const deleteSheet = useWorkbookStore((state) => state.deleteSheet);
  const deleteWorkbook = useWorkbookStore((state) => state.deleteWorkbook);
  const exportActiveSheetToCsv = useWorkbookStore(
    (state) => state.exportActiveSheetToCsv
  );
  const exportWorkbookToExcel = useWorkbookStore(
    (state) => state.exportWorkbookToExcel
  );
  const hydrationState = useWorkbookStore((state) => state.hydrationState);
  const importActiveSheetFromCsv = useWorkbookStore(
    (state) => state.importActiveSheetFromCsv
  );
  const importErrorMessage = useWorkbookStore(
    (state) => state.importErrorMessage
  );
  const importFileName = useWorkbookStore((state) => state.importFileName);
  const importPhase = useWorkbookStore((state) => state.importPhase);
  const importWorkbookFromExcel = useWorkbookStore(
    (state) => state.importWorkbookFromExcel
  );
  const insertColumns = useWorkbookStore((state) => state.insertColumns);
  const insertRows = useWorkbookStore((state) => state.insertRows);
  const isRemoteSyncAuthenticated = useWorkbookStore(
    (state) => state.isRemoteSyncAuthenticated
  );
  const lastSyncErrorMessage = useWorkbookStore(
    (state) => state.lastSyncErrorMessage
  );
  const lastSyncedAt = useWorkbookStore((state) => state.lastSyncedAt);
  const manualSyncCooldownUntil = useWorkbookStore(
    (state) => state.manualSyncCooldownUntil
  );
  const hydrateWorkbookList = useWorkbookStore(
    (state) => state.hydrateWorkbookList
  );
  const openWorkbook = useWorkbookStore((state) => state.openWorkbook);
  const reorderColumn = useWorkbookStore((state) => state.reorderColumn);
  const reorderRow = useWorkbookStore((state) => state.reorderRow);
  const renameColumn = useWorkbookStore((state) => state.renameColumn);
  const renameWorkbook = useWorkbookStore((state) => state.renameWorkbook);
  const redo = useWorkbookStore((state) => state.redo);
  const remoteVersion = useWorkbookStore((state) => state.remoteVersion);
  const remoteSyncStatus = useWorkbookStore((state) => state.remoteSyncStatus);
  const resizeColumn = useWorkbookStore((state) => state.resizeColumn);
  const resizeRow = useWorkbookStore((state) => state.resizeRow);
  const saveState = useWorkbookStore((state) => state.saveState);
  const setActiveSheet = useWorkbookStore((state) => state.setActiveSheet);
  const setPersistedCellFormats = useWorkbookStore(
    (state) => state.setCellFormats
  );
  const setPersistedCellValuesAndFormats = useWorkbookStore(
    (state) => state.setCellValuesAndFormats
  );
  const setCellValuesByKey = useWorkbookStore(
    (state) => state.setCellValuesByKey
  );
  const setPersistedCellValue = useWorkbookStore((state) => state.setCellValue);
  const setWorkbookFavorite = useWorkbookStore(
    (state) => state.setWorkbookFavorite
  );
  const setWorkbookSharingAccessRole = useWorkbookStore(
    (state) => state.setWorkbookSharingAccessRole
  );
  const setWorkbookSharingEnabled = useWorkbookStore(
    (state) => state.setWorkbookSharingEnabled
  );
  const sheets = useWorkbookStore((state) => state.sheets);
  const syncNow = useWorkbookStore((state) => state.syncNow);
  const undo = useWorkbookStore((state) => state.undo);
  const workbooks = useWorkbookStore((state) => state.workbooks);
  const workerResetKey = useWorkbookStore((state) => state.workerResetKey);
  const [activeCell, setActiveCell] = useState<CellPosition | null>(null);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [editingOriginalValue, setEditingOriginalValue] = useState("");
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [computedCells, setComputedCells] = useState<Record<string, CellData>>(
    {}
  );
  const [pendingSelectionOperationLabel, setPendingSelectionOperationLabel] =
    useState<string | null>(null);
  const [showSelectionOperationStatus, setShowSelectionOperationStatus] =
    useState(false);
  const [isSheetComputing, setIsSheetComputing] = useState(false);
  const [showSheetLoadingStatus, setShowSheetLoadingStatus] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const previousColumnNamesRef = useRef<string[]>([]);
  const activeColumnNames = useMemo(() => {
    const next = activeSheetColumns.map((column) => column.name);
    const prev = previousColumnNamesRef.current;
    if (
      prev.length === next.length &&
      prev.every((name, i) => name === next[i])
    ) {
      return prev;
    }
    previousColumnNamesRef.current = next;
    return next;
  }, [activeSheetColumns]);
  const columnCount = activeColumnNames.length || DEFAULT_COLS;
  const [totalRowCount] = useState(DEFAULT_ROWS);
  const [rowCount, setRowCount] = useState(DEFAULT_VISIBLE_ROWS);

  const workerRef = useRef<Worker | null>(null);
  const clipboardRef = useRef<ClipboardPayload | null>(null);
  const activeWorkerRequestIdRef = useRef(0);
  const latestActiveColumnNamesRef = useRef<string[]>(activeColumnNames);
  const latestActiveSheetCellsRef =
    useRef<Record<string, PersistedCellRecord>>(activeSheetCells);
  const pendingWorkerInitFrameRef = useRef<number | null>(null);
  const pendingWorkerInitTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const previousSheetIdRef = useRef<string | null>(null);
  const shouldSkipNextWorkerSyncRef = useRef(true);
  const visibleWorkerInitInFlightRef = useRef(false);
  const resolvedRequestedAccessRole = requestedAccessRole ?? "editor";
  const effectiveCollaborationAccessRole = isSharedSession
    ? collaborationAccessRole
    : (collaborationAccessRole ?? resolvedRequestedAccessRole);
  const canEdit = isSharedSession
    ? effectiveCollaborationAccessRole === "editor"
    : resolvedRequestedAccessRole === "editor";
  const canManageSharing = currentUser !== null && !isSharedSession && canEdit;
  const canConfigureSharing = canManageSharing && SHARING_BACKEND_READY;
  const normalizedSelection = useMemo(
    () => normalizeSelectionRange(selection, columnCount, rowCount),
    [selection, columnCount, rowCount]
  );

  // Initialize Worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL(
        "@/web/features/workbook/editor/lib/spreadsheet.worker.ts",
        import.meta.url
      )
    );
    workerRef.current.onmessage = (
      e: MessageEvent<SpreadsheetWorkerResponse>
    ) => {
      if (e.data.type === "READY") {
        if (e.data.payload.requestId !== activeWorkerRequestIdRef.current) {
          console.warn("[worker-READY] Stale requestId, ignoring:", {
            received: e.data.payload.requestId,
            expected: activeWorkerRequestIdRef.current,
          });
          return;
        }

        const nextCells = applySpreadsheetPatch({}, e.data.payload.patch);
        const cellCount = Object.keys(nextCells).length;
        const sampleCells = Object.entries(nextCells)
          .slice(0, 5)
          .map(([k, v]) => `${k}=${v.computed}`);
        console.warn("[worker-READY] Setting computedCells:", {
          cellCount,
          sampleCells,
          deletions: e.data.payload.patch.deletions.length,
          updates: Object.keys(e.data.payload.patch.updates).length,
        });

        setComputedCells(nextCells);
        setIsSheetComputing(false);
        visibleWorkerInitInFlightRef.current = false;
        return;
      }

      if (e.data.type === "CELLS_PATCH") {
        setComputedCells((prev) =>
          applySpreadsheetPatch(prev, e.data.payload.patch)
        );
      }
    };

    return () => {
      if (pendingWorkerInitFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingWorkerInitFrameRef.current);
      }
      if (pendingWorkerInitTimeoutRef.current !== null) {
        clearTimeout(pendingWorkerInitTimeoutRef.current);
      }
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    if (workbookId) {
      if (activeWorkbook?.id === workbookId) {
        return;
      }

      openWorkbook(workbookId, undefined, isSharedSession).catch(
        () => undefined
      );
      return;
    }

    hydrateWorkbookList().catch(() => undefined);
  }, [
    activeWorkbook?.id,
    hydrateWorkbookList,
    isSharedSession,
    openWorkbook,
    workbookId,
  ]);

  useEffect(() => {
    const minimumVisibleRowCount = Math.min(
      totalRowCount,
      getRequiredVisibleRowCount(activeSheetCells)
    );
    const hasSheetChanged = previousSheetIdRef.current !== activeSheetId;

    setRowCount((previousRowCount) => {
      if (hasSheetChanged) {
        return minimumVisibleRowCount;
      }

      return previousRowCount < minimumVisibleRowCount
        ? minimumVisibleRowCount
        : previousRowCount;
    });
    previousSheetIdRef.current = activeSheetId;
  }, [activeSheetCells, activeSheetId, totalRowCount]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      setCurrentUser(nextUser);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    latestActiveSheetCellsRef.current = activeSheetCells;

    const cellCount = Object.keys(activeSheetCells).length;
    if (cellCount > 0) {
      const sampleCells = Object.entries(activeSheetCells)
        .slice(0, 5)
        .map(([k, v]) => `${k}=${v.raw}`);
      console.warn("[activeSheetCells-changed] Store updated:", {
        cellCount,
        sampleCells,
      });
    }
  }, [activeSheetCells]);

  useEffect(() => {
    if (workerResetKey.length === 0) {
      return;
    }

    latestActiveColumnNamesRef.current = activeColumnNames;

    if (pendingWorkerInitFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingWorkerInitFrameRef.current);
      pendingWorkerInitFrameRef.current = null;
    }

    if (pendingWorkerInitTimeoutRef.current !== null) {
      clearTimeout(pendingWorkerInitTimeoutRef.current);
      pendingWorkerInitTimeoutRef.current = null;
    }

    activeWorkerRequestIdRef.current += 1;
    const requestId = activeWorkerRequestIdRef.current;

    setComputedCells({});
    setIsSheetComputing(true);
    visibleWorkerInitInFlightRef.current = true;
    shouldSkipNextWorkerSyncRef.current = true;

    pendingWorkerInitFrameRef.current = window.requestAnimationFrame(() => {
      pendingWorkerInitFrameRef.current = null;
      pendingWorkerInitTimeoutRef.current = setTimeout(() => {
        pendingWorkerInitTimeoutRef.current = null;
        workerRef.current?.postMessage({
          type: "INIT",
          payload: {
            cells: latestActiveSheetCellsRef.current,
            columnNames: latestActiveColumnNamesRef.current,
            requestId,
          },
        });
      }, 0);
    });
  }, [activeColumnNames, workerResetKey]);

  useEffect(() => {
    latestActiveSheetCellsRef.current = activeSheetCells;

    if (shouldSkipNextWorkerSyncRef.current) {
      shouldSkipNextWorkerSyncRef.current = false;
      return;
    }

    if (visibleWorkerInitInFlightRef.current) {
      return;
    }

    if (pendingWorkerInitTimeoutRef.current !== null) {
      clearTimeout(pendingWorkerInitTimeoutRef.current);
    }

    activeWorkerRequestIdRef.current += 1;
    const requestId = activeWorkerRequestIdRef.current;

    pendingWorkerInitTimeoutRef.current = setTimeout(() => {
      pendingWorkerInitTimeoutRef.current = null;
      workerRef.current?.postMessage({
        type: "INIT",
        payload: {
          cells: latestActiveSheetCellsRef.current,
          columnNames: latestActiveColumnNamesRef.current,
          requestId,
        },
      });
    }, WORKER_INIT_SYNC_DELAY_MS);
  }, [activeSheetCells]);

  useEffect(() => {
    if (!pendingSelectionOperationLabel) {
      setShowSelectionOperationStatus(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowSelectionOperationStatus(true);
    }, SELECTION_OPERATION_STATUS_VISIBILITY_DELAY_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [pendingSelectionOperationLabel]);

  useEffect(() => {
    if (!isSheetComputing) {
      setShowSheetLoadingStatus(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowSheetLoadingStatus(true);
    }, SHEET_STATUS_VISIBILITY_DELAY_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isSheetComputing]);

  useEffect(() => {
    if (workerResetKey.length === 0) {
      return;
    }

    setActiveCell(null);
    setEditingCell(null);
    setSelection(null);
  }, [workerResetKey]);

  const getCellData = useCallback(
    (row: number, col: number): CellData => {
      if (editingCell?.row === row && editingCell.col === col) {
        return {
          computed: editingDraft,
          raw: editingDraft,
        };
      }

      const id = cellId(row, col);
      const persistedCell = activeSheetCells[id];
      const computedCell = computedCells[id];

      if (computedCell) {
        // If the persisted (Yjs) raw value has changed since the worker
        // last computed this cell, show the persisted value as a fallback
        // until the worker recomputes. This prevents stale computed entries
        // from hiding remote sync updates.
        if (persistedCell && persistedCell.raw !== computedCell.raw) {
          return {
            computed: persistedCell.raw,
            raw: persistedCell.raw,
          };
        }
        return computedCell;
      }

      if (!persistedCell) {
        return EMPTY_CELL;
      }

      return {
        computed: persistedCell.raw,
        raw: persistedCell.raw,
      };
    },
    [activeSheetCells, computedCells, editingCell, editingDraft]
  );

  const setCellValue = useCallback(
    (row: number, col: number, raw: string) => {
      if (!canEdit) {
        return;
      }

      setPersistedCellValue(row, col, raw).catch(() => undefined);

      workerRef.current?.postMessage({
        type: "UPDATE_CELL",
        payload: { row, col, raw },
      });
    },
    [canEdit, setPersistedCellValue]
  );

  const selectCell = useCallback((pos: CellPosition | null) => {
    setActiveCell(pos);
    setSelection(pos ? { start: pos, end: pos, mode: "cells" } : null);
    setEditingCell(null);
    setEditingDraft("");
    setEditingOriginalValue("");
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

  const runSelectionOperation = useCallback(
    async <T>(label: string, operation: () => Promise<T>): Promise<T> => {
      setPendingSelectionOperationLabel(label);

      try {
        return await operation();
      } finally {
        setPendingSelectionOperationLabel(null);
      }
    },
    []
  );

  const getCellFormat = useCallback(
    (row: number, col: number): CellFormat => {
      return activeSheetFormats[cellId(row, col)] ?? EMPTY_CELL_FORMAT;
    },
    [activeSheetFormats]
  );

  const sheetFooterSheetSummary = useMemo<SheetFooterSheetSummary>(() => {
    const populatedRows = new Set<number>();
    const populatedColumns = new Set<number>();

    for (const [storedCellKey, cellValue] of Object.entries(activeSheetCells)) {
      if (cellValue.raw.length === 0) {
        continue;
      }

      const position = parseStoredCellId(storedCellKey);
      if (!position) {
        continue;
      }

      populatedRows.add(position.row);
      populatedColumns.add(position.col);
    }

    return {
      filledCellCount: Object.keys(activeSheetCells).length,
      populatedColumnCount: populatedColumns.size,
      populatedRowCount: populatedRows.size,
      totalColumnCount: columnCount,
      totalRowCount,
    };
  }, [activeSheetCells, columnCount, totalRowCount]);

  const sheetFooterSelectionSummary =
    useMemo<SheetFooterSelectionSummary | null>(() => {
      const bounds = getSelectionBounds();
      if (!bounds) {
        return null;
      }

      const selectedCellCount =
        (bounds.endRow - bounds.startRow + 1) *
        (bounds.endCol - bounds.startCol + 1);

      let filledCellCount = 0;
      let numericCellCount = 0;
      let sum = 0;

      for (const cellKey of Object.keys(activeSheetCells)) {
        const position = parseStoredCellId(cellKey);
        if (!position) {
          continue;
        }

        if (
          position.row < bounds.startRow ||
          position.row > bounds.endRow ||
          position.col < bounds.startCol ||
          position.col > bounds.endCol
        ) {
          continue;
        }

        const cellValue = getCellData(position.row, position.col);
        if (cellValue.raw.length === 0 && cellValue.computed.length === 0) {
          continue;
        }

        filledCellCount += 1;

        const numericValue = parseNumericCellValue(cellValue.computed);
        if (numericValue === null) {
          continue;
        }

        numericCellCount += 1;
        sum += numericValue;
      }

      return {
        average: numericCellCount > 0 ? sum / numericCellCount : null,
        filledCellCount,
        numericCellCount,
        selectedCellCount,
        sum: numericCellCount > 0 ? sum : null,
      };
    }, [activeSheetCells, getCellData, getSelectionBounds]);

  const getSelectionCellKeys = useCallback((): string[] => {
    const bounds = getSelectionBounds();
    if (!bounds) {
      return [];
    }

    const selectedCellKeys: string[] = [];
    for (let row = bounds.startRow; row <= bounds.endRow; row++) {
      for (let col = bounds.startCol; col <= bounds.endCol; col++) {
        selectedCellKeys.push(cellId(row, col));
      }
    }

    return selectedCellKeys;
  }, [getSelectionBounds]);

  const activeSelectionFormat = useMemo(() => {
    const bounds = normalizedSelection;
    if (
      bounds &&
      (bounds.startRow !== bounds.endRow || bounds.startCol !== bounds.endCol)
    ) {
      return null;
    }

    if (!activeCell) {
      return EMPTY_CELL_FORMAT;
    }

    return getCellFormat(activeCell.row, activeCell.col);
  }, [activeCell, getCellFormat, normalizedSelection]);

  const applyFormatsToSelection = useCallback(
    async (updater: (format: CellFormat) => CellFormat | null) => {
      if (!canEdit) {
        return false;
      }

      const selectedCellKeys = getSelectionCellKeys();
      if (selectedCellKeys.length === 0) {
        return false;
      }

      const nextFormats = Object.fromEntries(
        selectedCellKeys.map((selectedCellKey) => {
          const currentFormat = activeSheetFormats[selectedCellKey] ?? {};
          return [
            selectedCellKey,
            normalizeCellFormat(updater(currentFormat)),
          ] as const;
        })
      );

      return await runSelectionOperation("Applying format", async () => {
        await setPersistedCellFormats(nextFormats);
        return true;
      });
    },
    [
      activeSheetFormats,
      canEdit,
      getSelectionCellKeys,
      runSelectionOperation,
      setPersistedCellFormats,
    ]
  );

  const toggleCellFormat = useCallback(
    async (flag: CellFormatFlag): Promise<boolean> => {
      return await applyFormatsToSelection((currentFormat) => ({
        ...currentFormat,
        [flag]: !currentFormat[flag],
      }));
    },
    [applyFormatsToSelection]
  );

  const setCellTextTransform = useCallback(
    async (textTransform: CellTextTransform | null): Promise<boolean> => {
      return await applyFormatsToSelection((currentFormat) => ({
        ...currentFormat,
        textTransform:
          currentFormat.textTransform === textTransform
            ? undefined
            : (textTransform ?? undefined),
      }));
    },
    [applyFormatsToSelection]
  );

  const setCellTextColor = useCallback(
    async (textColor: string | null): Promise<boolean> => {
      return await applyFormatsToSelection((currentFormat) => ({
        ...currentFormat,
        textColor: textColor?.trim() || undefined,
      }));
    },
    [applyFormatsToSelection]
  );

  const setCellFontFamily = useCallback(
    async (fontFamily: string | null): Promise<boolean> => {
      return await applyFormatsToSelection((currentFormat) => ({
        ...currentFormat,
        fontFamily: fontFamily?.trim() || undefined,
      }));
    },
    [applyFormatsToSelection]
  );

  const setCellFontSize = useCallback(
    async (fontSize: number | null): Promise<boolean> => {
      return await applyFormatsToSelection((currentFormat) => ({
        ...currentFormat,
        fontSize:
          typeof fontSize === "number" &&
          Number.isFinite(fontSize) &&
          fontSize > 0
            ? fontSize
            : undefined,
      }));
    },
    [applyFormatsToSelection]
  );

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
    if (!canEdit) {
      return false;
    }

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
  }, [canEdit, copySelection, getSelectionBounds, setCellValuesByKey]);

  const pasteSelection = useCallback(async (): Promise<boolean> => {
    if (!canEdit) {
      return false;
    }

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
  }, [activeCell, canEdit, normalizedSelection, setCellValuesByKey]);

  const deleteSelectedRows = useCallback(async (): Promise<boolean> => {
    if (!canEdit) {
      return false;
    }

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
  }, [activeCell, canEdit, deleteRows, normalizedSelection, selectCell]);

  const deleteSelectedColumns = useCallback(async (): Promise<boolean> => {
    if (!canEdit) {
      return false;
    }

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
  }, [activeCell, canEdit, deleteColumns, normalizedSelection, selectCell]);

  const insertRowsRelativeToSelection = useCallback(
    async (position: "above" | "below"): Promise<boolean> => {
      if (!canEdit) {
        return false;
      }

      if (normalizedSelection?.mode === "rows") {
        const rowCount =
          normalizedSelection.endRow - normalizedSelection.startRow + 1;
        const startRow =
          position === "above"
            ? normalizedSelection.startRow
            : normalizedSelection.endRow + 1;

        await insertRows(startRow, rowCount);
        setSelection({
          end: { col: 0, row: startRow + rowCount - 1 },
          mode: "rows",
          start: { col: 0, row: startRow },
        });
        setActiveCell({ col: 0, row: startRow });
        setEditingCell(null);
        setEditingDraft("");
        setEditingOriginalValue("");
        return true;
      }

      if (!activeCell) {
        return false;
      }

      const startRow =
        position === "above" ? activeCell.row : activeCell.row + 1;
      await insertRows(startRow, 1);
      selectCell({ col: activeCell.col, row: startRow });
      return true;
    },
    [activeCell, canEdit, insertRows, normalizedSelection, selectCell]
  );

  const insertColumnsRelativeToSelection = useCallback(
    async (position: "left" | "right"): Promise<boolean> => {
      if (!canEdit) {
        return false;
      }

      if (normalizedSelection?.mode === "columns") {
        const columnCount =
          normalizedSelection.endCol - normalizedSelection.startCol + 1;
        const startColumn =
          position === "left"
            ? normalizedSelection.startCol
            : normalizedSelection.endCol + 1;

        await insertColumns(startColumn, columnCount);
        setSelection({
          end: { col: startColumn + columnCount - 1, row: 0 },
          mode: "columns",
          start: { col: startColumn, row: 0 },
        });
        setActiveCell({ col: startColumn, row: 0 });
        setEditingCell(null);
        setEditingDraft("");
        setEditingOriginalValue("");
        return true;
      }

      if (!activeCell) {
        return false;
      }

      const startColumn =
        position === "left" ? activeCell.col : activeCell.col + 1;
      await insertColumns(startColumn, 1);
      selectCell({ col: startColumn, row: activeCell.row });
      return true;
    },
    [activeCell, canEdit, insertColumns, normalizedSelection, selectCell]
  );

  const canSortSelection = useMemo(() => {
    const bounds = getSelectionBounds();
    if (!(canEdit && activeCell && bounds)) {
      return false;
    }

    if (bounds.mode === "columns" || bounds.startRow === bounds.endRow) {
      return false;
    }

    return activeCell.col >= bounds.startCol && activeCell.col <= bounds.endCol;
  }, [activeCell, canEdit, getSelectionBounds]);

  const sortRowsWithinBounds = useCallback(
    async (
      bounds: SortBounds,
      sortColumnIndex: number,
      direction: "asc" | "desc"
    ): Promise<boolean> => {
      const rowSnapshots = Array.from(
        { length: bounds.endRow - bounds.startRow + 1 },
        (_unused, rowOffset) => {
          const sourceRow = bounds.startRow + rowOffset;

          return {
            rowOffset,
            sortValue: getCellData(sourceRow, sortColumnIndex).computed,
            values: Array.from(
              { length: bounds.endCol - bounds.startCol + 1 },
              (_unusedCell, colOffset) => {
                const col = bounds.startCol + colOffset;
                const key = cellId(sourceRow, col);
                return {
                  format: activeSheetFormats[key] ?? null,
                  raw: getRawCellValue(sourceRow, col),
                };
              }
            ),
          };
        }
      );

      const sortedRows = [...rowSnapshots].sort((left, right) => {
        const comparison = compareCellValues(left.sortValue, right.sortValue);
        if (comparison === 0) {
          return left.rowOffset - right.rowOffset;
        }

        return direction === "asc" ? comparison : comparison * -1;
      });

      const hasChanged = sortedRows.some(
        (rowSnapshot, index) => rowSnapshot.rowOffset !== index
      );
      if (!hasChanged) {
        return true;
      }

      const nextValues: Record<string, string> = {};
      const nextFormats: Record<string, CellFormat | null> = {};
      for (const [targetOffset, rowSnapshot] of sortedRows.entries()) {
        const targetRow = bounds.startRow + targetOffset;

        for (const [colOffset, cellSnapshot] of rowSnapshot.values.entries()) {
          const targetKey = cellId(targetRow, bounds.startCol + colOffset);
          nextValues[targetKey] = cellSnapshot.raw;
          nextFormats[targetKey] = cellSnapshot.format;
        }
      }

      return await runSelectionOperation("Sorting selection", async () => {
        await setPersistedCellValuesAndFormats(nextValues, nextFormats);
        return true;
      });
    },
    [
      activeSheetFormats,
      getCellData,
      getRawCellValue,
      runSelectionOperation,
      setPersistedCellValuesAndFormats,
    ]
  );

  const sortSelectionByActiveColumn = useCallback(
    async (direction: "asc" | "desc"): Promise<boolean> => {
      const bounds = getSelectionBounds();
      if (!(canEdit && activeCell && bounds)) {
        return false;
      }

      if (bounds.mode === "columns" || bounds.startRow === bounds.endRow) {
        return false;
      }

      if (activeCell.col < bounds.startCol || activeCell.col > bounds.endCol) {
        return false;
      }

      return await sortRowsWithinBounds(bounds, activeCell.col, direction);
    },
    [activeCell, canEdit, getSelectionBounds, sortRowsWithinBounds]
  );

  const sortSheetByColumn = useCallback(
    async (
      columnIndex: number,
      direction: "asc" | "desc"
    ): Promise<boolean> => {
      if (!canEdit) {
        return false;
      }

      const bounds = getUsedSortBounds(
        activeSheetCells,
        activeSheetFormats,
        columnCount,
        columnIndex
      );
      if (!bounds || bounds.startRow === bounds.endRow) {
        return false;
      }

      return await sortRowsWithinBounds(bounds, columnIndex, direction);
    },
    [
      activeSheetCells,
      activeSheetFormats,
      canEdit,
      columnCount,
      sortRowsWithinBounds,
    ]
  );

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
      if (!canEdit) {
        return false;
      }

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
    [activeCell, canEdit, findNext, getRawCellValue, setCellValuesByKey]
  );

  const replaceAll = useCallback(
    async (
      query: string,
      replacement: string,
      caseSensitive = false
    ): Promise<number> => {
      if (!canEdit) {
        return 0;
      }

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
    [activeSheetCells, canEdit, setCellValuesByKey]
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
      setEditingDraft("");
      setEditingOriginalValue("");

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

  const startEditing = useCallback(
    (pos: CellPosition, initialDraft?: string) => {
      if (!canEdit) {
        return;
      }

      const currentRaw = activeSheetCells[cellId(pos.row, pos.col)]?.raw ?? "";
      setActiveCell(pos);
      setEditingCell(pos);
      setEditingOriginalValue(currentRaw);
      setEditingDraft(initialDraft ?? currentRaw);
    },
    [activeSheetCells, canEdit]
  );

  const updateEditingValue = useCallback((value: string) => {
    setEditingDraft(value);
  }, []);

  const stopEditing = useCallback(() => {
    setEditingCell(null);
    setEditingDraft("");
    setEditingOriginalValue("");
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
  const lastSyncedLabel = lastSyncedAt
    ? formatRelativeSyncTime(lastSyncedAt, now)
    : null;

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

  const commitEditing = useCallback(
    async (direction?: "down" | "left" | "right" | "up") => {
      const currentEditingCell = editingCell;
      const nextDraft = editingDraft;
      const previousValue = editingOriginalValue;

      console.warn("[commitEditing]", {
        hasCell: !!currentEditingCell,
        canEdit,
        nextDraft,
        previousValue,
        changed: nextDraft !== previousValue,
      });

      stopEditing();

      if (currentEditingCell && canEdit && nextDraft !== previousValue) {
        await setPersistedCellValue(
          currentEditingCell.row,
          currentEditingCell.col,
          nextDraft
        );

        workerRef.current?.postMessage({
          type: "UPDATE_CELL",
          payload: {
            col: currentEditingCell.col,
            raw: nextDraft,
            row: currentEditingCell.row,
          },
        });
      }

      if (direction) {
        navigateFromActive(direction);
      }
    },
    [
      canEdit,
      editingCell,
      editingDraft,
      editingOriginalValue,
      navigateFromActive,
      setPersistedCellValue,
      stopEditing,
    ]
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

      if (canEdit && key === "b") {
        event.preventDefault();
        toggleCellFormat("bold").catch(() => undefined);
        return;
      }

      if (canEdit && key === "i") {
        event.preventDefault();
        toggleCellFormat("italic").catch(() => undefined);
        return;
      }

      if (canEdit && key === "u") {
        event.preventDefault();
        toggleCellFormat("underline").catch(() => undefined);
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
  }, [
    canEdit,
    copySelection,
    cutSelection,
    pasteSelection,
    redo,
    toggleCellFormat,
    undo,
  ]);

  return {
    activeCell,
    activeSheetColumns,
    activeSheetFormats,
    activeSheetId,
    activeSheetRowHeights,
    activeWorkbook,
    activeSelectionFormat,
    collaborationAccessRole: effectiveCollaborationAccessRole,
    collaborationErrorMessage,
    collaborationPeers,
    collaborationStatus,
    canRedo,
    canUndo,
    canEdit,
    canSortSelection,
    sheetFooterSelectionSummary,
    sheetFooterSheetSummary,
    createSheet: async () => {
      if (!canEdit) {
        return;
      }

      await createSheet();
    },
    createWorkbook,
    canManualSync,
    canManageSharing,
    copySelection,
    cutSelection,
    deleteSelectedColumns,
    deleteSelectedRows,
    insertColumnLeft: async () => {
      return await insertColumnsRelativeToSelection("left");
    },
    insertColumnRight: async () => {
      return await insertColumnsRelativeToSelection("right");
    },
    insertRowAbove: async () => {
      return await insertRowsRelativeToSelection("above");
    },
    insertRowBelow: async () => {
      return await insertRowsRelativeToSelection("below");
    },
    deleteSheet: async (sheetId: string) => {
      if (!canEdit) {
        return false;
      }

      return await deleteSheet(sheetId);
    },
    deleteWorkbook,
    exportCsv: exportActiveSheetToCsv,
    exportExcel: exportWorkbookToExcel,
    editingCell,
    editingDraft,
    selection,
    canExpandRows,
    columnCount,
    expandRowCount,
    hydrationState,
    importActiveSheetFromCsv: async (file: File) => {
      if (!canEdit) {
        return;
      }

      await importActiveSheetFromCsv(file);
    },
    importWorkbookFromExcel: async (file: File) => {
      if (!canEdit) {
        return;
      }

      await importWorkbookFromExcel(file);
    },
    importErrorMessage,
    importFileName,
    importPhase,
    isSheetComputing,
    lastSyncErrorMessage,
    lastSyncedLabel,
    operationStatusLabel: showSelectionOperationStatus
      ? pendingSelectionOperationLabel
      : null,
    findNext,
    openWorkbook,
    pasteSelection,
    redo,
    renameColumn: (columnIndex: number, columnName: string) => {
      if (!canEdit) {
        return Promise.resolve(false);
      }

      return renameColumn(columnIndex, columnName);
    },
    reorderColumn: (sourceColumnIndex: number, targetColumnIndex: number) => {
      if (!canEdit) {
        return Promise.resolve();
      }

      return reorderColumn(sourceColumnIndex, targetColumnIndex);
    },
    reorderRow: (sourceRowIndex: number, targetRowIndex: number) => {
      if (!canEdit) {
        return Promise.resolve();
      }

      return reorderRow(sourceRowIndex, targetRowIndex);
    },
    resizeColumn: (columnIndex: number, width: number) => {
      if (!canEdit) {
        return Promise.resolve();
      }

      return resizeColumn(columnIndex, width);
    },
    resizeRow: (rowIndex: number, height: number) => {
      if (!canEdit) {
        return Promise.resolve();
      }

      return resizeRow(rowIndex, height);
    },
    renameWorkbook: async (name: string) => {
      if (!canEdit) {
        return;
      }

      await renameWorkbook(name);
    },
    remoteSyncStatus,
    remoteVersion,
    replaceAll,
    replaceCurrent,
    rowCount,
    saveState,
    sheetLoadStatusLabel: showSheetLoadingStatus ? "Loading sheet" : null,
    sharingAccessRole: activeWorkbook?.sharingAccessRole ?? "viewer",
    sharingEnabled:
      SHARING_BACKEND_READY && (activeWorkbook?.sharingEnabled ?? false),
    sheets,
    sortSelectionByActiveColumn,
    sortSheetByColumn,
    syncNow,
    setSelectionRange,
    setCellFontFamily,
    setCellFontSize,
    setCellTextColor,
    setCellTextTransform,
    updateEditingValue,
    totalRowCount,
    getCellData,
    getCellFormat,
    commitEditing,
    setCellValue,
    selectCell,
    setActiveSheet,
    setWorkbookFavorite: async (isFavorite: boolean) => {
      if (!canEdit) {
        return;
      }

      await setWorkbookFavorite(isFavorite);
    },
    setWorkbookSharingAccessRole: (accessRole: CollaborationAccessRole) => {
      if (!canConfigureSharing) {
        return Promise.resolve(false);
      }

      return setWorkbookSharingAccessRole(accessRole);
    },
    setWorkbookSharingEnabled: (sharingEnabled: boolean) => {
      if (!canConfigureSharing) {
        return Promise.resolve(false);
      }

      return setWorkbookSharingEnabled(sharingEnabled);
    },
    showAllRows,
    startEditing,
    stopEditing,
    toggleCellFormat,
    undo,
    navigateFromActive,
    workbooks,
    getColumnName: (col: number) => resolveColumnName(activeColumnNames, col),
    getCellReferenceLabel: (row: number, col: number) =>
      buildCellReferenceLabel(row, col, activeColumnNames),
  };
}
