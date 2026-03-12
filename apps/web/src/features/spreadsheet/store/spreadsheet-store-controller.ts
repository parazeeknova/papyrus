"use client";

import {
  createSheet,
  createSheetUndoManager,
  ensureWorkbookInitialized,
  getActiveSheetId,
  getSheetCells,
  getSheets,
  getWorkbookMeta,
  getWorkbookSnapshot,
  replaceSheetCells,
  replaceSheetColumns,
  replaceSheetFormats,
  replaceSheetRowHeights,
  resetWorkbook,
  setActiveSheet as setActiveSheetInDoc,
  setWorkbookFavorite as setWorkbookFavoriteInDoc,
  setWorkbookSharingAccessRole as setWorkbookSharingAccessRoleInDoc,
  setWorkbookSharingEnabled as setWorkbookSharingEnabledInDoc,
  touchWorkbook,
} from "@papyrus/core/workbook-doc";
import {
  attachWorkbookPersistence,
  waitForWorkbookPersistence,
} from "@papyrus/core/workbook-persistence";
import {
  listWorkbookRegistryEntries,
  upsertWorkbookRegistryEntry,
} from "@papyrus/core/workbook-registry";
import type { SheetColumn, WorkbookMeta } from "@papyrus/core/workbook-types";
import { createLogger } from "@papyrus/logs";
import { onAuthStateChanged, type User } from "firebase/auth";
import { applyUpdate, Doc, encodeStateAsUpdate, type UndoManager } from "yjs";
import { firebaseAuth } from "@/web/features/auth/lib/firebase-auth";
import {
  shouldHydrateLocalWorkbook,
  shouldUploadLocalWorkbook,
} from "@/web/features/spreadsheet/lib/cloud-sync-reconciliation";
import {
  type CloudWorkbookState,
  cloudWorkbookStore,
} from "@/web/features/spreadsheet/lib/cloud-workbook-store";
import { colToLetter } from "@/web/features/spreadsheet/lib/spreadsheet-engine";
import {
  exportCsvFile,
  exportExcelFile,
  type ImportedSheetData,
  parseCsvImport,
  parseExcelImport,
} from "@/web/features/spreadsheet/lib/workbook-file-format";
import type {
  SpreadsheetStoreGetState,
  SpreadsheetStoreSetState,
} from "./spreadsheet-store-types";

type WorkbookPersistence = ReturnType<typeof attachWorkbookPersistence>;

interface ActiveWorkbookSession {
  dirty: boolean;
  doc: Doc;
  handleDocUpdate: (update: Uint8Array, origin: unknown) => void;
  handleUndoStackChange: () => void;
  isSharedSession: boolean;
  persistence: WorkbookPersistence | null;
  sessionId: number;
  undoManager: UndoManager | null;
}

interface SpreadsheetStoreModuleState {
  activeWorkbookSession: ActiveWorkbookSession | null;
  currentAuthenticatedUser: User | null;
  hasInitializedAuthSync: boolean;
  hasResolvedInitialAuthState: boolean;
  nextWorkbookActivationId: number;
  nextWorkbookSessionId: number;
  remoteSyncTimeout: ReturnType<typeof setTimeout> | null;
}

export interface SpreadsheetStoreController {
  activateWorkbook: (
    workbookId: string,
    fallbackName?: string,
    isSharedSession?: boolean
  ) => Promise<void>;
  buildColumnNames: (columns: { name: string }[]) => string[];
  closeActiveWorkbookSession: () => Promise<void>;
  exportActiveSheetToCsv: () => Promise<void>;
  exportWorkbookToExcel: () => Promise<void>;
  fillColumnNames: (columnNames: string[], targetLength: number) => string[];
  flushActiveRemoteWorkbookSync: (options?: {
    retryDelayMs?: number;
    scheduleRetryOnLeaseFailure?: boolean;
  }) => Promise<boolean>;
  getActiveWorkbookSession: () => ActiveWorkbookSession | null;
  getCurrentAuthenticatedUser: () => User | null;
  importActiveSheetFromCsv: (file: File) => Promise<void>;
  importWorkbookFromExcel: (file: File) => Promise<void>;
  initializeAuthSync: () => void;
  isViewerAccess: () => boolean;
  persistActiveWorkbookMeta: () => Promise<void>;
  syncActiveWorkbookShareAccess: () => Promise<void>;
  syncUndoManager: (doc: Doc) => void;
}

const moduleState: SpreadsheetStoreModuleState = {
  activeWorkbookSession: null,
  currentAuthenticatedUser: null,
  hasInitializedAuthSync: false,
  hasResolvedInitialAuthState: false,
  nextWorkbookActivationId: 0,
  nextWorkbookSessionId: 0,
  remoteSyncTimeout: null,
};

const FIRESTORE_SYNC_DEBOUNCE_MS = 2500;
const FIRESTORE_LEASE_RETRY_MS = 3000;
const FIRESTORE_SYNC_ORIGIN = "firestore-sync";
const FIRESTORE_SYNC_CLIENT_ID = crypto.randomUUID();
const IMPORT_EXPORT_MIN_COLUMN_COUNT = 100;
const IMPORT_EXPORT_SHEET_FALLBACK_NAME = "Sheet1";
const syncLogger = createLogger({ scope: "spreadsheet-sync" });

const clearRemoteSyncTimeout = (): void => {
  if (!moduleState.remoteSyncTimeout) {
    return;
  }

  clearTimeout(moduleState.remoteSyncTimeout);
  moduleState.remoteSyncTimeout = null;
};

const getTimestampValue = (value: string): number => {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const getPersistedSyncTimestamp = (
  value: string | null | undefined
): number | null => {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

const buildPersistedWorkbookMeta = (
  workbook: WorkbookMeta,
  lastSyncedAt: string | null,
  remoteVersion: number | null
): WorkbookMeta => {
  return {
    ...workbook,
    lastSyncedAt,
    remoteVersion,
  };
};

const isActiveSession = (session: ActiveWorkbookSession): boolean => {
  return moduleState.activeWorkbookSession?.sessionId === session.sessionId;
};

const isCurrentWorkbookActivation = (activationId: number): boolean => {
  return moduleState.nextWorkbookActivationId === activationId;
};

const sortWorkbooks = (workbooks: WorkbookMeta[]): WorkbookMeta[] => {
  return workbooks.toSorted((left, right) =>
    right.lastOpenedAt.localeCompare(left.lastOpenedAt)
  );
};

const buildColumnNames = (columns: { name: string }[]): string[] => {
  return columns.map((column) => column.name);
};

const fillColumnNames = (
  columnNames: string[],
  targetLength: number
): string[] => {
  const nextColumnNames = [...columnNames];

  while (nextColumnNames.length < targetLength) {
    nextColumnNames.push(colToLetter(nextColumnNames.length));
  }

  return nextColumnNames;
};

const getImportedColumnCount = (rows: string[][]): number => {
  const widestRowLength = rows.reduce(
    (maxColumnCount, row) => Math.max(maxColumnCount, row.length),
    0
  );

  return Math.max(IMPORT_EXPORT_MIN_COLUMN_COUNT, widestRowLength);
};

const buildImportedSheetColumns = (columnCount: number): SheetColumn[] => {
  return Array.from({ length: columnCount }, (_unused, index) => ({
    index,
    name: colToLetter(index),
    width: 100,
  }));
};

const buildImportedSheetCells = (rows: string[][]): Record<string, string> => {
  const nextCells: Record<string, string> = {};

  for (const [rowIndex, row] of rows.entries()) {
    for (const [columnIndex, cellValue] of row.entries()) {
      if (cellValue === "") {
        continue;
      }

      nextCells[`C${columnIndex}R${rowIndex}`] = cellValue;
    }
  }

  return nextCells;
};

const loadLocalWorkbookState = async (
  workbookId: string,
  fallbackName?: string
): Promise<CloudWorkbookState> => {
  const doc = new Doc();
  const persistence = attachWorkbookPersistence(workbookId, doc);

  try {
    await waitForWorkbookPersistence(persistence);
    ensureWorkbookInitialized(doc, {
      name: fallbackName,
      workbookId,
    });

    const snapshot = getWorkbookSnapshot(doc);
    return {
      activeSheetId: snapshot.activeSheetId,
      meta: snapshot.workbook,
      update: encodeStateAsUpdate(doc),
      version: 0,
    };
  } finally {
    await persistence.destroy();
    doc.destroy();
  }
};

const persistRemoteWorkbookLocally = async (
  workbook: CloudWorkbookState
): Promise<void> => {
  const doc = new Doc();
  const persistence = attachWorkbookPersistence(workbook.meta.id, doc);

  try {
    await waitForWorkbookPersistence(persistence);
    applyUpdate(doc, workbook.update, FIRESTORE_SYNC_ORIGIN);
    await upsertWorkbookRegistryEntry(
      buildPersistedWorkbookMeta(
        getWorkbookMeta(doc),
        workbook.meta.lastSyncedAt ?? null,
        workbook.version
      )
    );
  } finally {
    await persistence.destroy();
    doc.destroy();
  }
};

const getUndoState = (
  undoManager: UndoManager | null
): {
  canRedo: boolean;
  canUndo: boolean;
} => {
  return {
    canRedo: (undoManager?.redoStack.length ?? 0) > 0,
    canUndo: (undoManager?.undoStack.length ?? 0) > 0,
  };
};

export const createSpreadsheetStoreController = (
  set: SpreadsheetStoreSetState,
  get: SpreadsheetStoreGetState
): SpreadsheetStoreController => {
  const refreshWorkbookRegistry = async (): Promise<void> => {
    const workbooks = await listWorkbookRegistryEntries();
    set({ workbooks: sortWorkbooks(workbooks) });
  };

  const syncActiveWorkbookShareAccess = async (): Promise<void> => {
    if (
      !(
        moduleState.currentAuthenticatedUser &&
        moduleState.activeWorkbookSession
      ) ||
      moduleState.activeWorkbookSession.isSharedSession
    ) {
      return;
    }

    const workbook = getWorkbookMeta(moduleState.activeWorkbookSession.doc);
    await cloudWorkbookStore.upsertSharingAccess(
      moduleState.currentAuthenticatedUser.uid,
      workbook
    );
  };

  const persistActiveWorkbookMeta = async (): Promise<void> => {
    if (
      !moduleState.activeWorkbookSession ||
      moduleState.activeWorkbookSession.isSharedSession
    ) {
      return;
    }

    await upsertWorkbookRegistryEntry(
      getWorkbookMeta(moduleState.activeWorkbookSession.doc)
    );
    await refreshWorkbookRegistry();
  };

  const destroyActiveWorkbookSession = async (): Promise<void> => {
    if (!moduleState.activeWorkbookSession) {
      return;
    }

    clearRemoteSyncTimeout();
    const {
      doc,
      handleDocUpdate,
      handleUndoStackChange,
      persistence,
      undoManager,
    } = moduleState.activeWorkbookSession;
    doc.off("update", handleDocUpdate);
    undoManager?.off("stack-item-added", handleUndoStackChange);
    undoManager?.off("stack-item-popped", handleUndoStackChange);
    undoManager?.off("stack-cleared", handleUndoStackChange);
    undoManager?.destroy();
    await persistence?.destroy();
    doc.destroy();
    moduleState.activeWorkbookSession = null;
  };

  const scheduleRemoteWorkbookSync = (
    session: ActiveWorkbookSession | null,
    options?: {
      delayMs?: number;
    }
  ): void => {
    if (!(moduleState.currentAuthenticatedUser && session)) {
      return;
    }

    if (!(isActiveSession(session) && session.dirty)) {
      return;
    }

    clearRemoteSyncTimeout();
    if (isActiveSession(session)) {
      set({ remoteSyncStatus: "pending" });
    }
    syncLogger.debug("Scheduled debounced Firestore workbook sync.");
    moduleState.remoteSyncTimeout = setTimeout(() => {
      flushRemoteWorkbookSync(session).catch((error) => {
        syncLogger.error("Failed to flush Firestore workbook sync.", error);
        if (isActiveSession(session)) {
          set({
            lastSyncErrorMessage:
              error instanceof Error ? error.message : String(error),
            remoteSyncStatus: "error",
            saveState: "error",
          });
        }
      });
    }, options?.delayMs ?? FIRESTORE_SYNC_DEBOUNCE_MS);
  };

  const flushRemoteWorkbookSync = async (
    session: ActiveWorkbookSession | null,
    options?: {
      retryDelayMs?: number;
      scheduleRetryOnLeaseFailure?: boolean;
    }
  ): Promise<boolean> => {
    if (
      !(moduleState.currentAuthenticatedUser && session) ||
      session.isSharedSession
    ) {
      return false;
    }

    if (!session.dirty) {
      syncLogger.debug(
        "Skipped Firestore sync because there are no local workbook changes."
      );
      return false;
    }

    if (isActiveSession(session)) {
      set({ remoteSyncStatus: "syncing" });
    }

    const localSnapshot = getWorkbookSnapshot(session.doc);
    const currentUserId = moduleState.currentAuthenticatedUser.uid;
    const hasLease = await cloudWorkbookStore.acquireSyncLease(
      currentUserId,
      localSnapshot.workbook.id,
      FIRESTORE_SYNC_CLIENT_ID
    );
    if (!hasLease) {
      syncLogger.debug(
        `Skipped Firestore sync for workbook ${localSnapshot.workbook.id}; another client holds the lease.`
      );
      if (options?.scheduleRetryOnLeaseFailure !== false) {
        scheduleRemoteWorkbookSync(session, {
          delayMs: options?.retryDelayMs ?? FIRESTORE_LEASE_RETRY_MS,
        });
      } else if (isActiveSession(session)) {
        set({ remoteSyncStatus: "pending" });
      }

      return false;
    }

    const remoteWorkbook = await cloudWorkbookStore.readWorkbook(
      currentUserId,
      localSnapshot.workbook.id
    );

    if (remoteWorkbook) {
      syncLogger.debug(
        `Merging remote Firestore state into workbook ${localSnapshot.workbook.id} before upload.`
      );
      applyUpdate(session.doc, remoteWorkbook.update, FIRESTORE_SYNC_ORIGIN);
    }

    const mergedSnapshot = getWorkbookSnapshot(session.doc);
    await cloudWorkbookStore.writeWorkbook(
      currentUserId,
      {
        activeSheetId: mergedSnapshot.activeSheetId,
        meta: mergedSnapshot.workbook,
        update: encodeStateAsUpdate(session.doc),
        version: remoteWorkbook?.version ?? 0,
      },
      FIRESTORE_SYNC_CLIENT_ID
    );
    syncLogger.info(
      `Synced workbook ${mergedSnapshot.workbook.id} to Firestore for ${currentUserId}.`
    );
    session.dirty = false;
    const persistedLastSyncedAt = new Date().toISOString();
    const nextRemoteVersion = (remoteWorkbook?.version ?? 0) + 1;
    if (isActiveSession(session)) {
      set({
        lastSyncErrorMessage: null,
        lastSyncedAt: getTimestampValue(persistedLastSyncedAt),
        remoteSyncStatus: "synced",
        remoteVersion: nextRemoteVersion,
      });
    }
    await upsertWorkbookRegistryEntry(
      buildPersistedWorkbookMeta(
        mergedSnapshot.workbook,
        persistedLastSyncedAt,
        nextRemoteVersion
      )
    );
    if (isActiveSession(session)) {
      await refreshWorkbookRegistry();
    }

    return true;
  };

  const reconcileRemoteWorkbooks = async (user: User): Promise<void> => {
    const localWorkbooks = sortWorkbooks(await listWorkbookRegistryEntries());
    const remoteWorkbooks = sortWorkbooks(
      await cloudWorkbookStore.listWorkbooks(user.uid)
    );
    set({ lastSyncErrorMessage: null, remoteSyncStatus: "syncing" });
    syncLogger.info(
      `Reconciling ${localWorkbooks.length} local and ${remoteWorkbooks.length} remote workbooks for ${user.uid}.`
    );
    const localById = new Map(
      localWorkbooks.map((workbook) => [workbook.id, workbook])
    );
    const remoteById = new Map(
      remoteWorkbooks.map((workbook) => [workbook.id, workbook])
    );

    for (const remoteWorkbookMeta of remoteWorkbooks) {
      const localWorkbookMeta = localById.get(remoteWorkbookMeta.id);
      if (!shouldHydrateLocalWorkbook(remoteWorkbookMeta, localWorkbookMeta)) {
        continue;
      }

      const remoteWorkbook = await cloudWorkbookStore.readWorkbook(
        user.uid,
        remoteWorkbookMeta.id
      );
      if (!remoteWorkbook) {
        syncLogger.warn(
          `Remote workbook ${remoteWorkbookMeta.id} metadata exists but no snapshot could be loaded.`
        );
        continue;
      }

      if (
        get().activeWorkbook?.id === remoteWorkbook.meta.id &&
        moduleState.activeWorkbookSession
      ) {
        syncLogger.debug(
          `Applying remote workbook ${remoteWorkbook.meta.id} into the active Yjs doc.`
        );
        applyUpdate(
          moduleState.activeWorkbookSession.doc,
          remoteWorkbook.update,
          FIRESTORE_SYNC_ORIGIN
        );
        await upsertWorkbookRegistryEntry(
          buildPersistedWorkbookMeta(
            getWorkbookMeta(moduleState.activeWorkbookSession.doc),
            remoteWorkbook.meta.lastSyncedAt ?? null,
            remoteWorkbook.version
          )
        );
        continue;
      }

      syncLogger.info(
        `Hydrating remote workbook ${remoteWorkbook.meta.id} into IndexedDB.`
      );
      await persistRemoteWorkbookLocally(remoteWorkbook);
    }

    // Promote local guest workbooks sequentially after login so each upload
    // sees a stable Firestore view and the user gets deterministic error
    // handling if a specific workbook cannot be upgraded.
    for (const localWorkbookMeta of localWorkbooks) {
      const remoteWorkbookMeta = remoteById.get(localWorkbookMeta.id);
      if (!shouldUploadLocalWorkbook(localWorkbookMeta, remoteWorkbookMeta)) {
        continue;
      }

      const localWorkbook =
        get().activeWorkbook?.id === localWorkbookMeta.id &&
        moduleState.activeWorkbookSession
          ? {
              activeSheetId: getActiveSheetId(
                moduleState.activeWorkbookSession.doc
              ),
              meta: getWorkbookMeta(moduleState.activeWorkbookSession.doc),
              update: encodeStateAsUpdate(
                moduleState.activeWorkbookSession.doc
              ),
              version: 0,
            }
          : await loadLocalWorkbookState(
              localWorkbookMeta.id,
              localWorkbookMeta.name
            );

      await cloudWorkbookStore.writeWorkbook(
        user.uid,
        localWorkbook,
        FIRESTORE_SYNC_CLIENT_ID
      );
      syncLogger.info(
        `Uploaded local workbook ${localWorkbook.meta.id} to Firestore.`
      );

      set({
        lastSyncErrorMessage: null,
        lastSyncedAt: Date.now(),
        remoteVersion: localWorkbook.version + 1,
      });

      if (
        get().activeWorkbook?.id === localWorkbook.meta.id &&
        moduleState.activeWorkbookSession
      ) {
        moduleState.activeWorkbookSession.dirty = false;
      }
    }

    set({ remoteSyncStatus: "synced" });
    await refreshWorkbookRegistry();
  };

  const applySnapshot = (
    doc: Doc,
    options?: { forceWorkerReset?: boolean }
  ): void => {
    const snapshot = getWorkbookSnapshot(doc);

    const cellCount = Object.keys(snapshot.activeSheetCells).length;
    const sampleCells = Object.entries(snapshot.activeSheetCells)
      .slice(0, 8)
      .map(([k, v]) => `${k}="${v.raw}"`);
    console.warn("[applySnapshot]", {
      cellCount,
      sampleCells,
      sheetId: snapshot.activeSheetId,
      forceWorkerReset: options?.forceWorkerReset,
    });

    set((state) => {
      const persistedWorkbookMeta = state.workbooks.find(
        (workbook) => workbook.id === snapshot.workbook.id
      );
      const persistedLastSyncedAt = getPersistedSyncTimestamp(
        persistedWorkbookMeta?.lastSyncedAt
      );
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
        activeSheetFormats: snapshot.activeSheetFormats,
        activeSheetId: snapshot.activeSheetId,
        activeSheetRowHeights: snapshot.activeSheetRowHeights,
        activeWorkbook: buildPersistedWorkbookMeta(
          snapshot.workbook,
          persistedWorkbookMeta?.lastSyncedAt ?? null,
          persistedWorkbookMeta?.remoteVersion ?? null
        ),
        hydrationState: "ready",
        lastSyncedAt: persistedLastSyncedAt,
        remoteVersion: persistedWorkbookMeta?.remoteVersion ?? null,
        saveState: "saved",
        sheets: snapshot.sheets,
        workerResetKey:
          shouldResetWorker || didColumnsChange
            ? `${snapshot.workbook.id}:${snapshot.activeSheetId ?? "none"}:${snapshot.workbook.updatedAt}`
            : state.workerResetKey,
        ...getUndoState(moduleState.activeWorkbookSession?.undoManager ?? null),
      };
    });
  };

  const replaceSheetFromImportedRows = (
    doc: Doc,
    sheetId: string,
    importedSheet: ImportedSheetData
  ): void => {
    replaceSheetColumns(
      doc,
      sheetId,
      buildImportedSheetColumns(getImportedColumnCount(importedSheet.rows))
    );
    replaceSheetCells(
      doc,
      sheetId,
      buildImportedSheetCells(importedSheet.rows)
    );
    replaceSheetFormats(doc, sheetId, {});
    replaceSheetRowHeights(doc, sheetId, {});
  };

  const finalizeImportedWorkbookChange = async (doc: Doc): Promise<void> => {
    syncUndoManager(doc);
    applySnapshot(doc, { forceWorkerReset: true });
    await syncActiveWorkbookShareAccess();
    await persistActiveWorkbookMeta();
  };

  const setImportStatus = (
    importPhase: "applying" | "error" | "idle" | "parsing" | "reading",
    options?: {
      errorMessage?: string | null;
      fileName?: string | null;
    }
  ): void => {
    set({
      importErrorMessage: options?.errorMessage ?? null,
      importFileName:
        options && "fileName" in options
          ? (options.fileName ?? null)
          : get().importFileName,
      importPhase,
    });
  };

  const syncUndoManager = (doc: Doc): void => {
    if (!moduleState.activeWorkbookSession) {
      return;
    }

    moduleState.activeWorkbookSession.undoManager?.off(
      "stack-item-added",
      moduleState.activeWorkbookSession.handleUndoStackChange
    );
    moduleState.activeWorkbookSession.undoManager?.off(
      "stack-item-popped",
      moduleState.activeWorkbookSession.handleUndoStackChange
    );
    moduleState.activeWorkbookSession.undoManager?.off(
      "stack-cleared",
      moduleState.activeWorkbookSession.handleUndoStackChange
    );
    moduleState.activeWorkbookSession.undoManager?.destroy();

    const undoManager = createSheetUndoManager(doc, getActiveSheetId(doc));
    const handleUndoStackChange = (): void => {
      set(getUndoState(undoManager));
    };

    undoManager?.on("stack-item-added", handleUndoStackChange);
    undoManager?.on("stack-item-popped", handleUndoStackChange);
    undoManager?.on("stack-cleared", handleUndoStackChange);

    moduleState.activeWorkbookSession.undoManager = undoManager;
    moduleState.activeWorkbookSession.handleUndoStackChange =
      handleUndoStackChange;
    set(getUndoState(undoManager));
  };

  const activateWorkbook = async (
    workbookId: string,
    fallbackName?: string,
    isSharedSession = false
  ): Promise<void> => {
    if (
      moduleState.activeWorkbookSession &&
      moduleState.activeWorkbookSession.isSharedSession === isSharedSession &&
      getWorkbookMeta(moduleState.activeWorkbookSession.doc).id === workbookId
    ) {
      syncUndoManager(moduleState.activeWorkbookSession.doc);
      applySnapshot(moduleState.activeWorkbookSession.doc);
      return;
    }

    moduleState.nextWorkbookActivationId += 1;
    const activationId = moduleState.nextWorkbookActivationId;
    set({ hydrationState: "loading", saveState: "saving" });

    clearRemoteSyncTimeout();
    if (
      moduleState.currentAuthenticatedUser &&
      moduleState.activeWorkbookSession?.dirty
    ) {
      await flushRemoteWorkbookSync(moduleState.activeWorkbookSession, {
        scheduleRetryOnLeaseFailure: false,
      });
    }

    if (!isCurrentWorkbookActivation(activationId)) {
      return;
    }

    await destroyActiveWorkbookSession();

    if (!isCurrentWorkbookActivation(activationId)) {
      return;
    }

    const doc = new Doc();
    const persistence = isSharedSession
      ? null
      : attachWorkbookPersistence(workbookId, doc);
    moduleState.nextWorkbookSessionId += 1;

    if (persistence) {
      await waitForWorkbookPersistence(persistence);
    }

    if (!isCurrentWorkbookActivation(activationId)) {
      await persistence?.destroy();
      doc.destroy();
      return;
    }

    if (
      !isSharedSession &&
      moduleState.currentAuthenticatedUser &&
      getWorkbookMeta(doc).id.length === 0
    ) {
      const remoteWorkbook = await cloudWorkbookStore.readWorkbook(
        moduleState.currentAuthenticatedUser.uid,
        workbookId
      );

      if (!isCurrentWorkbookActivation(activationId)) {
        await persistence?.destroy();
        doc.destroy();
        return;
      }

      if (remoteWorkbook) {
        applyUpdate(doc, remoteWorkbook.update, FIRESTORE_SYNC_ORIGIN);
        await upsertWorkbookRegistryEntry(
          buildPersistedWorkbookMeta(
            remoteWorkbook.meta,
            remoteWorkbook.meta.lastSyncedAt ?? null,
            remoteWorkbook.version
          )
        );
        await refreshWorkbookRegistry();
      }
    }

    ensureWorkbookInitialized(doc, {
      name: fallbackName,
      workbookId,
    });

    touchWorkbook(doc, getActiveSheetId(doc) ?? undefined);

    const session: ActiveWorkbookSession = {
      dirty: false,
      doc,
      handleDocUpdate: () => undefined,
      handleUndoStackChange: () => undefined,
      isSharedSession,
      persistence,
      sessionId: moduleState.nextWorkbookSessionId,
      undoManager: null,
    };

    session.handleDocUpdate = (_update: Uint8Array, origin: unknown) => {
      applySnapshot(doc);

      if (!(session.isSharedSession || origin === FIRESTORE_SYNC_ORIGIN)) {
        session.dirty = true;
        scheduleRemoteWorkbookSync(session);
      }
    };
    session.handleUndoStackChange = () => {
      set(getUndoState(moduleState.activeWorkbookSession?.undoManager ?? null));
    };

    doc.on("update", session.handleDocUpdate);

    if (!isCurrentWorkbookActivation(activationId)) {
      doc.off("update", session.handleDocUpdate);
      await persistence?.destroy();
      doc.destroy();
      return;
    }

    moduleState.activeWorkbookSession = session;
    syncUndoManager(doc);

    applySnapshot(doc, { forceWorkerReset: true });

    if (isSharedSession) {
      set({ hydrationState: "loading" });
    }

    await syncActiveWorkbookShareAccess();
    await persistActiveWorkbookMeta();
  };

  const initializeAuthSync = (): void => {
    if (moduleState.hasInitializedAuthSync) {
      return;
    }

    moduleState.hasInitializedAuthSync = true;
    onAuthStateChanged(firebaseAuth, (user) => {
      moduleState.currentAuthenticatedUser = user;
      clearRemoteSyncTimeout();
      set({
        isRemoteSyncAuthenticated: user !== null,
        remoteSyncStatus: user ? "idle" : "disabled",
      });

      if (!user) {
        set({
          collaborationErrorMessage: null,
          lastSyncErrorMessage: null,
          lastSyncedAt: null,
          remoteVersion: null,
        });
        if (moduleState.hasResolvedInitialAuthState) {
          syncLogger.info("Signed out; paused Firestore workbook syncing.");
        }

        moduleState.hasResolvedInitialAuthState = true;
        return;
      }

      moduleState.hasResolvedInitialAuthState = true;
      syncLogger.info(
        `Signed in as ${user.uid}; starting workbook reconciliation.`
      );

      reconcileRemoteWorkbooks(user)
        .then(async () => {
          await syncActiveWorkbookShareAccess();
          if (moduleState.activeWorkbookSession) {
            scheduleRemoteWorkbookSync(moduleState.activeWorkbookSession);
          }
        })
        .catch((error) => {
          syncLogger.error(
            "Failed to reconcile Firestore workbooks after login.",
            error
          );
          set({
            lastSyncErrorMessage:
              error instanceof Error ? error.message : String(error),
            remoteSyncStatus: "error",
            saveState: "error",
          });
        });
    });
  };

  return {
    activateWorkbook,
    buildColumnNames,
    closeActiveWorkbookSession: destroyActiveWorkbookSession,
    exportActiveSheetToCsv: () => {
      const activeWorkbookSession = moduleState.activeWorkbookSession;
      const activeSheetId = get().activeSheetId;
      if (!(activeWorkbookSession && activeSheetId)) {
        return Promise.resolve();
      }

      const workbook = getWorkbookMeta(activeWorkbookSession.doc);
      const activeSheet = getSheets(activeWorkbookSession.doc).find(
        (sheet) => sheet.id === activeSheetId
      );

      exportCsvFile(
        workbook.name,
        activeSheet?.name ?? IMPORT_EXPORT_SHEET_FALLBACK_NAME,
        getSheetCells(activeWorkbookSession.doc, activeSheetId)
      );
      return Promise.resolve();
    },
    exportWorkbookToExcel: () => {
      const activeWorkbookSession = moduleState.activeWorkbookSession;
      if (!activeWorkbookSession) {
        return Promise.resolve();
      }

      exportExcelFile(
        getWorkbookMeta(activeWorkbookSession.doc).name,
        getSheets(activeWorkbookSession.doc).map((sheet) => ({
          cells: getSheetCells(activeWorkbookSession.doc, sheet.id),
          name: sheet.name,
        }))
      );
      return Promise.resolve();
    },
    fillColumnNames,
    flushActiveRemoteWorkbookSync: (options) => {
      return flushRemoteWorkbookSync(
        moduleState.activeWorkbookSession,
        options
      );
    },
    getActiveWorkbookSession: () => moduleState.activeWorkbookSession,
    getCurrentAuthenticatedUser: () => moduleState.currentAuthenticatedUser,
    importActiveSheetFromCsv: async (file: File) => {
      const activeWorkbookSession = moduleState.activeWorkbookSession;
      const activeSheetId = get().activeSheetId;
      if (!(activeWorkbookSession && activeSheetId)) {
        return;
      }

      try {
        setImportStatus("reading", { fileName: file.name });
        const fileContents = await file.arrayBuffer();
        setImportStatus("parsing");
        const importedSheet = parseCsvImport(file.name, fileContents);
        setImportStatus("applying");
        activeWorkbookSession.doc.transact(() => {
          replaceSheetFromImportedRows(
            activeWorkbookSession.doc,
            activeSheetId,
            importedSheet
          );
        });

        await finalizeImportedWorkbookChange(activeWorkbookSession.doc);
        setImportStatus("idle", { fileName: null });
      } catch (error) {
        setImportStatus("error", {
          errorMessage:
            error instanceof Error
              ? error.message
              : "Failed to import CSV file.",
          fileName: file.name,
        });
        set({ saveState: "error" });
        throw error;
      }
    },
    importWorkbookFromExcel: async (file: File) => {
      const activeWorkbookSession = moduleState.activeWorkbookSession;
      if (!activeWorkbookSession) {
        return;
      }

      try {
        setImportStatus("reading", { fileName: file.name });
        const fileContents = await file.arrayBuffer();
        setImportStatus("parsing");
        const importedWorkbook = parseExcelImport(file.name, fileContents);
        const previousWorkbookMeta = getWorkbookMeta(activeWorkbookSession.doc);

        setImportStatus("applying");
        activeWorkbookSession.doc.transact(() => {
          resetWorkbook(activeWorkbookSession.doc);
          ensureWorkbookInitialized(activeWorkbookSession.doc, {
            initialSheetName:
              importedWorkbook.sheets[0]?.name ??
              IMPORT_EXPORT_SHEET_FALLBACK_NAME,
            name: importedWorkbook.name,
            workbookId: previousWorkbookMeta.id,
          });

          const firstSheetId = getActiveSheetId(activeWorkbookSession.doc);
          if (firstSheetId && importedWorkbook.sheets[0]) {
            replaceSheetFromImportedRows(
              activeWorkbookSession.doc,
              firstSheetId,
              importedWorkbook.sheets[0]
            );
          }

          for (const importedSheet of importedWorkbook.sheets.slice(1)) {
            const nextSheet = createSheet(
              activeWorkbookSession.doc,
              importedSheet.name
            );
            replaceSheetFromImportedRows(
              activeWorkbookSession.doc,
              nextSheet.id,
              importedSheet
            );
          }

          if (firstSheetId) {
            setActiveSheetInDoc(activeWorkbookSession.doc, firstSheetId);
          }

          setWorkbookFavoriteInDoc(
            activeWorkbookSession.doc,
            previousWorkbookMeta.isFavorite
          );
          setWorkbookSharingEnabledInDoc(
            activeWorkbookSession.doc,
            previousWorkbookMeta.sharingEnabled
          );
          setWorkbookSharingAccessRoleInDoc(
            activeWorkbookSession.doc,
            previousWorkbookMeta.sharingAccessRole
          );
        });

        await finalizeImportedWorkbookChange(activeWorkbookSession.doc);
        setImportStatus("idle", { fileName: null });
      } catch (error) {
        setImportStatus("error", {
          errorMessage:
            error instanceof Error
              ? error.message
              : "Failed to import Excel workbook.",
          fileName: file.name,
        });
        set({ saveState: "error" });
        throw error;
      }
    },
    initializeAuthSync,
    isViewerAccess: () => get().collaborationAccessRole === "viewer",
    persistActiveWorkbookMeta,
    syncActiveWorkbookShareAccess,
    syncUndoManager,
  };
};
