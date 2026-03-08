"use client";

import type {
  CollaborationAccessRole,
  CollaboratorIdentity,
} from "@papyrus/core/collaboration-types";
import type {
  CellFormat,
  CellTextTransform,
} from "@papyrus/core/workbook-types";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { firebaseAuth } from "@/web/features/auth/lib/firebase-auth";
import { buildCollaboratorIdentity } from "@/web/features/spreadsheet/lib/collaboration";
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
const EMPTY_CELL_FORMAT: CellFormat = {};
const LAST_SYNC_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
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

interface ClipboardPayload {
  matrix: string[][];
}

interface UseSpreadsheetOptions {
  isSharedSession?: boolean;
  requestedAccessRole?: CollaborationAccessRole | null;
  syncServerUrl?: string | null;
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
  syncServerUrl = null,
  workbookId = null,
}: UseSpreadsheetOptions = {}) {
  const activeSheetCells = useSpreadsheetStore(
    (state) => state.activeSheetCells
  );
  const activeSheetColumns = useSpreadsheetStore(
    (state) => state.activeSheetColumns
  );
  const activeSheetFormats = useSpreadsheetStore(
    (state) => state.activeSheetFormats
  );
  const activeSheetRowHeights = useSpreadsheetStore(
    (state) => state.activeSheetRowHeights
  );
  const activeSheetId = useSpreadsheetStore((state) => state.activeSheetId);
  const activeWorkbook = useSpreadsheetStore((state) => state.activeWorkbook);
  const canRedo = useSpreadsheetStore((state) => state.canRedo);
  const canUndo = useSpreadsheetStore((state) => state.canUndo);
  const collaborationAccessRole = useSpreadsheetStore(
    (state) => state.collaborationAccessRole
  );
  const collaborationErrorMessage = useSpreadsheetStore(
    (state) => state.collaborationErrorMessage
  );
  const collaborationPeers = useSpreadsheetStore(
    (state) => state.collaborationPeers
  );
  const collaborationStatus = useSpreadsheetStore(
    (state) => state.collaborationStatus
  );
  const connectRealtime = useSpreadsheetStore((state) => state.connectRealtime);
  const createSheet = useSpreadsheetStore((state) => state.createSheet);
  const createWorkbook = useSpreadsheetStore((state) => state.createWorkbook);
  const deleteColumns = useSpreadsheetStore((state) => state.deleteColumns);
  const deleteRows = useSpreadsheetStore((state) => state.deleteRows);
  const deleteWorkbook = useSpreadsheetStore((state) => state.deleteWorkbook);
  const exportActiveSheetToCsv = useSpreadsheetStore(
    (state) => state.exportActiveSheetToCsv
  );
  const exportWorkbookToExcel = useSpreadsheetStore(
    (state) => state.exportWorkbookToExcel
  );
  const hydrationState = useSpreadsheetStore((state) => state.hydrationState);
  const importActiveSheetFromCsv = useSpreadsheetStore(
    (state) => state.importActiveSheetFromCsv
  );
  const importErrorMessage = useSpreadsheetStore(
    (state) => state.importErrorMessage
  );
  const importFileName = useSpreadsheetStore((state) => state.importFileName);
  const importPhase = useSpreadsheetStore((state) => state.importPhase);
  const importWorkbookFromExcel = useSpreadsheetStore(
    (state) => state.importWorkbookFromExcel
  );
  const isRemoteSyncAuthenticated = useSpreadsheetStore(
    (state) => state.isRemoteSyncAuthenticated
  );
  const lastSyncErrorMessage = useSpreadsheetStore(
    (state) => state.lastSyncErrorMessage
  );
  const lastSyncedAt = useSpreadsheetStore((state) => state.lastSyncedAt);
  const manualSyncCooldownUntil = useSpreadsheetStore(
    (state) => state.manualSyncCooldownUntil
  );
  const hydrateWorkbookList = useSpreadsheetStore(
    (state) => state.hydrateWorkbookList
  );
  const openWorkbook = useSpreadsheetStore((state) => state.openWorkbook);
  const reorderColumn = useSpreadsheetStore((state) => state.reorderColumn);
  const reorderRow = useSpreadsheetStore((state) => state.reorderRow);
  const renameColumn = useSpreadsheetStore((state) => state.renameColumn);
  const renameWorkbook = useSpreadsheetStore((state) => state.renameWorkbook);
  const redo = useSpreadsheetStore((state) => state.redo);
  const remoteVersion = useSpreadsheetStore((state) => state.remoteVersion);
  const remoteSyncStatus = useSpreadsheetStore(
    (state) => state.remoteSyncStatus
  );
  const resizeColumn = useSpreadsheetStore((state) => state.resizeColumn);
  const resizeRow = useSpreadsheetStore((state) => state.resizeRow);
  const saveState = useSpreadsheetStore((state) => state.saveState);
  const setActiveSheet = useSpreadsheetStore((state) => state.setActiveSheet);
  const setPersistedCellFormats = useSpreadsheetStore(
    (state) => state.setCellFormats
  );
  const setCellValuesByKey = useSpreadsheetStore(
    (state) => state.setCellValuesByKey
  );
  const setPersistedCellValue = useSpreadsheetStore(
    (state) => state.setCellValue
  );
  const setWorkbookFavorite = useSpreadsheetStore(
    (state) => state.setWorkbookFavorite
  );
  const setWorkbookSharingAccessRole = useSpreadsheetStore(
    (state) => state.setWorkbookSharingAccessRole
  );
  const setWorkbookSharingEnabled = useSpreadsheetStore(
    (state) => state.setWorkbookSharingEnabled
  );
  const sheets = useSpreadsheetStore((state) => state.sheets);
  const stopRealtime = useSpreadsheetStore((state) => state.stopRealtime);
  const syncNow = useSpreadsheetStore((state) => state.syncNow);
  const undo = useSpreadsheetStore((state) => state.undo);
  const updateRealtimePresence = useSpreadsheetStore(
    (state) => state.updateRealtimePresence
  );
  const updateRealtimeTyping = useSpreadsheetStore(
    (state) => state.updateRealtimeTyping
  );
  const workbooks = useSpreadsheetStore((state) => state.workbooks);
  const workerResetKey = useSpreadsheetStore((state) => state.workerResetKey);
  const [activeCell, setActiveCell] = useState<CellPosition | null>(null);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [editingOriginalValue, setEditingOriginalValue] = useState("");
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [computedCells, setComputedCells] = useState<Record<string, CellData>>(
    {}
  );
  const [now, setNow] = useState(() => Date.now());
  const [collaborationIdentity, setCollaborationIdentity] =
    useState<CollaboratorIdentity | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
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
  const previousSheetIdRef = useRef<string | null>(null);
  const stopRealtimeRef = useRef(stopRealtime);
  stopRealtimeRef.current = stopRealtime;
  const resolvedRequestedAccessRole = requestedAccessRole ?? "editor";
  const effectiveCollaborationAccessRole = isSharedSession
    ? collaborationAccessRole
    : (collaborationAccessRole ?? resolvedRequestedAccessRole);
  const canEdit = isSharedSession
    ? effectiveCollaborationAccessRole === "editor"
    : resolvedRequestedAccessRole === "editor";
  const canManageSharing = currentUser !== null && !isSharedSession && canEdit;
  const remoteCollaborationPeers = useMemo(() => {
    if (!collaborationIdentity) {
      return collaborationPeers;
    }

    return collaborationPeers.filter(
      (peer) => peer.identity.clientId !== collaborationIdentity.clientId
    );
  }, [collaborationIdentity, collaborationPeers]);
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
      if (e.data.type === "READY") {
        setComputedCells(applySpreadsheetPatch({}, e.data.payload.patch));
        return;
      }

      if (e.data.type === "CELLS_PATCH") {
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
    let isCancelled = false;

    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      setCurrentUser(nextUser);
      buildCollaboratorIdentity(nextUser)
        .then((identity) => {
          if (!isCancelled) {
            setCollaborationIdentity(identity);
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setCollaborationIdentity(null);
          }
        });
    });

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, []);

  // Connection-only effect: idempotently (re)connects when deps change.
  // No cleanup — teardown is handled by the unmount-only effect below.
  // This prevents StrictMode / dep-change cleanup from cycling the socket.
  useEffect(() => {
    if (!(workbookId && collaborationIdentity && syncServerUrl)) {
      return;
    }

    connectRealtime(
      resolvedRequestedAccessRole,
      collaborationIdentity,
      syncServerUrl,
      isSharedSession,
      workbookId
    );
  }, [
    collaborationIdentity,
    connectRealtime,
    isSharedSession,
    resolvedRequestedAccessRole,
    syncServerUrl,
    workbookId,
  ]);

  // Unmount-only cleanup: tears down the WebSocket only when the component
  // truly unmounts (navigating away), not on every effect re-fire.
  useEffect(() => {
    return () => {
      stopRealtimeRef.current();
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
    workerCellsRef.current = activeSheetCellsForWorker;
    workerColumnNamesRef.current = activeColumnNames;
    workerRef.current?.postMessage({
      type: "INIT",
      payload: {
        cells: workerCellsRef.current,
        columnNames: workerColumnNamesRef.current,
      },
    });
  }, [activeColumnNames, activeSheetCellsForWorker]);

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

  const getCellFormat = useCallback(
    (row: number, col: number): CellFormat => {
      return activeSheetFormats[cellId(row, col)] ?? EMPTY_CELL_FORMAT;
    },
    [activeSheetFormats]
  );

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

      await setPersistedCellFormats(nextFormats);
      return true;
    },
    [activeSheetFormats, canEdit, getSelectionCellKeys, setPersistedCellFormats]
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
    updateRealtimePresence(activeCell);
  }, [activeCell, updateRealtimePresence]);

  useEffect(() => {
    if (!(editingCell && activeSheetId)) {
      updateRealtimeTyping({
        cell: null,
        draft: null,
        sheetId: null,
      });
      return;
    }

    updateRealtimeTyping({
      cell: editingCell,
      draft: editingDraft,
      sheetId: activeSheetId,
    });
  }, [activeSheetId, editingCell, editingDraft, updateRealtimeTyping]);

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
    collaborationIdentity,
    collaborationPeers: remoteCollaborationPeers,
    collaborationStatus,
    currentUser,
    canRedo,
    canUndo,
    canEdit,
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
    lastSyncErrorMessage,
    lastSyncedLabel,
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
    sharingAccessRole: activeWorkbook?.sharingAccessRole ?? "viewer",
    sharingEnabled: activeWorkbook?.sharingEnabled ?? false,
    sheets,
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
      if (!canManageSharing) {
        return Promise.resolve(false);
      }

      return setWorkbookSharingAccessRole(accessRole);
    },
    setWorkbookSharingEnabled: (sharingEnabled: boolean) => {
      if (!canManageSharing) {
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
