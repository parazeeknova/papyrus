"use client";

import {
  createSheet,
  createWorkbookId,
  ensureWorkbookInitialized,
  getActiveSheetId,
  getWorkbookMeta,
  getWorkbookSnapshot,
  renameSheetColumn,
  renameWorkbook as renameWorkbookInDoc,
  setActiveSheet as setActiveSheetInDoc,
  setSheetCellRaw,
  setSheetCellValues,
  setWorkbookFavorite,
  touchWorkbook,
} from "@papyrus/core/workbook-doc";
import {
  attachWorkbookPersistence,
  deleteWorkbookPersistence,
  waitForWorkbookPersistence,
} from "@papyrus/core/workbook-persistence";
import {
  deleteWorkbookRegistryEntry,
  listWorkbookRegistryEntries,
  upsertWorkbookRegistryEntry,
} from "@papyrus/core/workbook-registry";
import type {
  PersistedCellRecord,
  SheetColumn,
  SheetMeta,
  WorkbookMeta,
} from "@papyrus/core/workbook-types";
import { Doc } from "yjs";
import { create } from "zustand";
import {
  cellId,
  isValidColumnName,
  normalizeColumnName,
  rewriteFormulaColumnName,
} from "@/web/features/spreadsheet/lib/spreadsheet-engine";

type HydrationState = "error" | "idle" | "loading" | "ready";
type SaveState = "error" | "saved" | "saving";

interface SpreadsheetStoreState {
  activeSheetCells: Record<string, PersistedCellRecord>;
  activeSheetColumns: SheetColumn[];
  activeSheetId: string | null;
  activeWorkbook: WorkbookMeta | null;
  createSheet: () => Promise<void>;
  createWorkbook: () => Promise<void>;
  deleteWorkbook: () => Promise<void>;
  hydrateWorkbookList: () => Promise<void>;
  hydrationState: HydrationState;
  openWorkbook: (workbookId: string, name?: string) => Promise<void>;
  renameColumn: (columnIndex: number, columnName: string) => Promise<boolean>;
  renameWorkbook: (name: string) => Promise<void>;
  saveState: SaveState;
  setActiveSheet: (sheetId: string) => Promise<void>;
  setCellValue: (row: number, col: number, raw: string) => Promise<void>;
  setWorkbookFavorite: (isFavorite: boolean) => Promise<void>;
  sheets: SheetMeta[];
  workbooks: WorkbookMeta[];
  workerResetKey: string;
}

type WorkbookPersistence = ReturnType<typeof attachWorkbookPersistence>;

interface ActiveWorkbookSession {
  doc: Doc;
  handleDocUpdate: () => void;
  persistence: WorkbookPersistence;
}

let activeWorkbookSession: ActiveWorkbookSession | null = null;

function sortWorkbooks(workbooks: WorkbookMeta[]): WorkbookMeta[] {
  return workbooks.toSorted((left, right) =>
    right.lastOpenedAt.localeCompare(left.lastOpenedAt)
  );
}

async function refreshWorkbookRegistry(
  set: (partial: Partial<SpreadsheetStoreState>) => void
): Promise<void> {
  const workbooks = await listWorkbookRegistryEntries();
  set({ workbooks: sortWorkbooks(workbooks) });
}

async function persistActiveWorkbookMeta(
  set: (partial: Partial<SpreadsheetStoreState>) => void
): Promise<void> {
  if (!activeWorkbookSession) {
    return;
  }

  await upsertWorkbookRegistryEntry(getWorkbookMeta(activeWorkbookSession.doc));
  await refreshWorkbookRegistry(set);
}

async function destroyActiveWorkbookSession(): Promise<void> {
  if (!activeWorkbookSession) {
    return;
  }

  const { doc, handleDocUpdate, persistence } = activeWorkbookSession;
  doc.off("update", handleDocUpdate);
  await persistence.destroy();
  doc.destroy();
  activeWorkbookSession = null;
}

export const useSpreadsheetStore = create<SpreadsheetStoreState>((set, get) => {
  const applySnapshot = (
    doc: Doc,
    options?: { forceWorkerReset?: boolean }
  ) => {
    const snapshot = getWorkbookSnapshot(doc);

    set((state) => {
      const shouldResetWorker =
        options?.forceWorkerReset ||
        state.activeWorkbook?.id !== snapshot.workbook.id ||
        state.activeSheetId !== snapshot.activeSheetId;
      const didColumnsChange =
        state.activeSheetColumns.length !==
          snapshot.activeSheetColumns.length ||
        state.activeSheetColumns.some(
          (column, index) =>
            column.name !== snapshot.activeSheetColumns[index]?.name
        );

      return {
        activeSheetCells: snapshot.activeSheetCells,
        activeSheetColumns: snapshot.activeSheetColumns,
        activeSheetId: snapshot.activeSheetId,
        activeWorkbook: snapshot.workbook,
        hydrationState: "ready",
        saveState: "saved",
        sheets: snapshot.sheets,
        workerResetKey:
          shouldResetWorker || didColumnsChange
            ? `${snapshot.workbook.id}:${snapshot.activeSheetId ?? "none"}:${snapshot.workbook.updatedAt}`
            : state.workerResetKey,
      };
    });
  };

  const activateWorkbook = async (
    workbookId: string,
    fallbackName?: string
  ): Promise<void> => {
    set({ hydrationState: "loading", saveState: "saving" });

    await destroyActiveWorkbookSession();

    const doc = new Doc();
    const persistence = attachWorkbookPersistence(workbookId, doc);

    await waitForWorkbookPersistence(persistence);

    ensureWorkbookInitialized(doc, {
      name: fallbackName,
      workbookId,
    });

    touchWorkbook(doc, getActiveSheetId(doc) ?? undefined);

    const handleDocUpdate = () => {
      applySnapshot(doc);
    };

    doc.on("update", handleDocUpdate);

    activeWorkbookSession = {
      doc,
      handleDocUpdate,
      persistence,
    };

    applySnapshot(doc, { forceWorkerReset: true });
    await persistActiveWorkbookMeta(set);
  };

  return {
    activeSheetCells: {},
    activeSheetColumns: [],
    activeSheetId: null,
    activeWorkbook: null,
    createSheet: async () => {
      if (!activeWorkbookSession) {
        return;
      }

      set({ saveState: "saving" });
      const nextSheet = createSheet(activeWorkbookSession.doc);
      setActiveSheetInDoc(activeWorkbookSession.doc, nextSheet.id);
      await persistActiveWorkbookMeta(set);
    },
    createWorkbook: async () => {
      const nextWorkbookId = createWorkbookId();
      await activateWorkbook(nextWorkbookId);
    },
    deleteWorkbook: async () => {
      const workbookId = get().activeWorkbook?.id;
      if (!workbookId) {
        return;
      }

      set({ hydrationState: "loading", saveState: "saving" });

      try {
        await destroyActiveWorkbookSession();
        await deleteWorkbookPersistence(workbookId, new Doc());
        await deleteWorkbookRegistryEntry(workbookId);

        const workbooks = sortWorkbooks(await listWorkbookRegistryEntries());
        set({ workbooks });

        const [nextWorkbook] = workbooks;
        if (nextWorkbook) {
          await activateWorkbook(nextWorkbook.id, nextWorkbook.name);
          return;
        }

        await get().createWorkbook();
      } catch {
        set({ hydrationState: "error", saveState: "error" });
      }
    },
    hydrationState: "idle",
    hydrateWorkbookList: async () => {
      if (get().hydrationState !== "idle") {
        return;
      }

      set({ hydrationState: "loading" });

      try {
        const workbooks = sortWorkbooks(await listWorkbookRegistryEntries());
        set({ workbooks });

        if (workbooks.length === 0) {
          await get().createWorkbook();
          return;
        }

        const [lastOpenedWorkbook] = workbooks;
        if (!lastOpenedWorkbook) {
          set({ hydrationState: "error", saveState: "error" });
          return;
        }

        await activateWorkbook(lastOpenedWorkbook.id, lastOpenedWorkbook.name);
      } catch {
        set({ hydrationState: "error", saveState: "error" });
      }
    },
    openWorkbook: async (workbookId, name) => {
      await activateWorkbook(workbookId, name);
    },
    renameColumn: async (columnIndex, columnName) => {
      const activeSheetId = get().activeSheetId;
      const currentColumn = get().activeSheetColumns[columnIndex];
      if (!(activeWorkbookSession && activeSheetId && currentColumn)) {
        return false;
      }

      const normalizedName = normalizeColumnName(columnName);
      const hasDuplicateName = get().activeSheetColumns.some(
        (column) =>
          column.index !== columnIndex &&
          column.name.toUpperCase() === normalizedName.toUpperCase()
      );

      if (!isValidColumnName(normalizedName) || hasDuplicateName) {
        return false;
      }

      if (normalizedName === currentColumn.name) {
        return true;
      }

      set({ saveState: "saving" });
      renameSheetColumn(
        activeWorkbookSession.doc,
        activeSheetId,
        columnIndex,
        normalizedName
      );

      const rewrittenFormulas = Object.fromEntries(
        Object.entries(get().activeSheetCells)
          .map(([cellKey, cellValue]) => [
            cellKey,
            rewriteFormulaColumnName(
              cellValue.raw,
              currentColumn.name,
              normalizedName
            ),
          ])
          .filter(([_, nextRaw]) => nextRaw.startsWith("="))
      );

      if (Object.keys(rewrittenFormulas).length > 0) {
        setSheetCellValues(
          activeWorkbookSession.doc,
          activeSheetId,
          rewrittenFormulas
        );
      }

      await persistActiveWorkbookMeta(set);
      return true;
    },
    renameWorkbook: async (name) => {
      if (!activeWorkbookSession) {
        return;
      }

      set({ saveState: "saving" });
      renameWorkbookInDoc(activeWorkbookSession.doc, name);
      await persistActiveWorkbookMeta(set);
    },
    saveState: "saved",
    setActiveSheet: async (sheetId) => {
      if (!activeWorkbookSession) {
        return;
      }

      set({ saveState: "saving" });
      setActiveSheetInDoc(activeWorkbookSession.doc, sheetId);
      touchWorkbook(activeWorkbookSession.doc, sheetId);
      await persistActiveWorkbookMeta(set);
    },
    setCellValue: (row, col, raw) => {
      const activeSheetId = get().activeSheetId;
      if (!(activeWorkbookSession && activeSheetId)) {
        return Promise.resolve();
      }

      set({ saveState: "saving" });
      setSheetCellRaw(
        activeWorkbookSession.doc,
        activeSheetId,
        cellId(row, col),
        raw
      );

      return persistActiveWorkbookMeta(set);
    },
    setWorkbookFavorite: async (isFavorite) => {
      if (!activeWorkbookSession) {
        return;
      }

      set({ saveState: "saving" });
      setWorkbookFavorite(activeWorkbookSession.doc, isFavorite);
      await persistActiveWorkbookMeta(set);
    },
    sheets: [],
    workerResetKey: "initial",
    workbooks: [],
  };
});
