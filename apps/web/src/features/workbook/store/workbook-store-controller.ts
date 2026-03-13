"use client";

import type {
  CollaborationAccessRole,
  CollaboratorPresence,
  CollaboratorSelectionRange,
} from "@papyrus/core/collaboration-types";
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
import { applyUpdate, Doc, encodeStateAsUpdate, type UndoManager } from "yjs";
import {
  shouldHydrateLocalWorkbook,
  shouldUploadLocalWorkbook,
} from "@/web/features/workbook/cloud-sync/lib/cloud-sync-reconciliation";
import {
  type CloudWorkbookState,
  cloudWorkbookStore,
} from "@/web/features/workbook/cloud-sync/lib/cloud-workbook-store";
import {
  connectWorkbookRealtimeChannel,
  type WorkbookRealtimeChannelConnection,
} from "@/web/features/workbook/collaboration/lib/workbook-realtime-channel-client";
import { colToLetter } from "@/web/features/workbook/editor/lib/spreadsheet-engine";
import {
  exportCsvFile,
  exportExcelFile,
  type ImportedSheetData,
  parseCsvImport,
  parseExcelImport,
} from "@/web/features/workbook/import-export/lib/workbook-file-format";
import {
  type AuthenticatedUser,
  onAuthStateChange,
} from "@/web/platform/auth/auth-client";
import type {
  WorkbookStoreGetState,
  WorkbookStoreSetState,
} from "./workbook-store-types";

type WorkbookPersistence = ReturnType<typeof attachWorkbookPersistence>;

interface ActiveWorkbookSession {
  dirty: boolean;
  doc: Doc;
  handleDocUpdate: (update: Uint8Array, origin: unknown) => void;
  handleUndoStackChange: () => void;
  isSharedSession: boolean;
  persistence: WorkbookPersistence | null;
  realtimeAccessRole: CollaborationAccessRole | null;
  realtimeConnection: WorkbookRealtimeChannelConnection | null;
  realtimeConnectPromise: Promise<void> | null;
  realtimeVersion: number;
  requestedAccessRole: CollaborationAccessRole | null;
  sessionId: number;
  undoManager: UndoManager | null;
  workbookId: string;
}

interface WorkbookStoreModuleState {
  activeWorkbookSession: ActiveWorkbookSession | null;
  currentAuthenticatedUser: AuthenticatedUser | null;
  hasInitializedAuthSync: boolean;
  hasResolvedInitialAuthState: boolean;
  nextWorkbookActivationId: number;
  nextWorkbookSessionId: number;
  remoteSyncTimeout: ReturnType<typeof setTimeout> | null;
}

export interface WorkbookStoreController {
  activateWorkbook: (
    workbookId: string,
    fallbackName?: string,
    isSharedSession?: boolean,
    requestedAccessRole?: CollaborationAccessRole | null
  ) => Promise<number | null>;
  buildColumnNames: (columns: { name: string }[]) => string[];
  closeActiveWorkbookSession: () => Promise<void>;
  closeWorkbookRouteSession: (
    workbookId: string,
    isSharedSession?: boolean,
    requestedAccessRole?: CollaborationAccessRole | null,
    expectedSessionId?: number | null
  ) => Promise<void>;
  exportActiveSheetToCsv: () => Promise<void>;
  exportWorkbookToExcel: () => Promise<void>;
  fillColumnNames: (columnNames: string[], targetLength: number) => string[];
  flushActiveRemoteWorkbookSync: (options?: {
    retryDelayMs?: number;
    scheduleRetryOnLeaseFailure?: boolean;
  }) => Promise<boolean>;
  getActiveWorkbookSession: () => ActiveWorkbookSession | null;
  getCurrentAuthenticatedUser: () => AuthenticatedUser | null;
  importActiveSheetFromCsv: (file: File) => Promise<void>;
  importWorkbookFromExcel: (file: File) => Promise<void>;
  initializeAuthSync: () => void;
  isViewerAccess: () => boolean;
  persistActiveWorkbookMeta: () => Promise<void>;
  publishCollaborationPresence: (payload: {
    activeCell: { col: number; row: number } | null;
    selection: CollaboratorSelectionRange | null;
    sheetId: string | null;
  }) => void;
  publishCollaborationTyping: (payload: {
    typing: {
      cell: { col: number; row: number };
      draft: string;
      sheetId: string;
    } | null;
  }) => void;
  syncUndoManager: (doc: Doc) => void;
}

const moduleState: WorkbookStoreModuleState = {
  activeWorkbookSession: null,
  currentAuthenticatedUser: null,
  hasInitializedAuthSync: false,
  hasResolvedInitialAuthState: false,
  nextWorkbookActivationId: 0,
  nextWorkbookSessionId: 0,
  remoteSyncTimeout: null,
};

const CLOUD_SYNC_DEBOUNCE_MS = 2500;
const CLOUD_SYNC_ORIGIN = "cloud-sync";
const REALTIME_SYNC_ORIGIN = "workbook-realtime-sync";
const CLOUD_SYNC_CLIENT_ID = crypto.randomUUID();
const IMPORT_EXPORT_MIN_COLUMN_COUNT = 100;
const IMPORT_EXPORT_SHEET_FALLBACK_NAME = "Sheet1";
const syncLogger = createLogger({ scope: "workbook-sync" });

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

const hasWorkbookDocumentState = (doc: Doc): boolean => {
  return getWorkbookMeta(doc).id.length > 0 || getSheets(doc).length > 0;
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
    const hasSyncedPersistence = await waitForWorkbookPersistence(persistence);
    if (!hasSyncedPersistence) {
      syncLogger.warn(
        "Workbook persistence did not finish syncing before timeout while loading a local workbook snapshot.",
        {
          workbookId,
        }
      );
    }
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
    const hasSyncedPersistence = await waitForWorkbookPersistence(persistence);
    if (!hasSyncedPersistence) {
      syncLogger.warn(
        "Workbook persistence did not finish syncing before timeout while storing a cloud workbook locally.",
        {
          workbookId: workbook.meta.id,
        }
      );
    }
    applyUpdate(doc, workbook.update, CLOUD_SYNC_ORIGIN);
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

export const createWorkbookStoreController = (
  set: WorkbookStoreSetState,
  get: WorkbookStoreGetState
): WorkbookStoreController => {
  const refreshWorkbookRegistry = async (): Promise<void> => {
    const workbooks = await listWorkbookRegistryEntries();
    set({ workbooks: sortWorkbooks(workbooks) });
  };

  const shouldSeedBlankWorkbook = (
    doc: Doc,
    _workbookId: string,
    isSharedSession: boolean
  ): boolean => {
    if (hasWorkbookDocumentState(doc) || isSharedSession) {
      return false;
    }

    // Seed a usable local workbook immediately and let the authenticated
    // realtime channel reconcile any cloud state after navigation.
    return true;
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

  const resetCollaborationState = (): void => {
    set({
      collaborationAccessRole: null,
      collaborationErrorMessage: null,
      collaborationPeers: [],
      collaborationStatus: "disconnected",
    });
  };

  const disconnectRealtimeSession = (session: ActiveWorkbookSession): void => {
    session.realtimeConnectPromise = null;
    session.realtimeConnection?.disconnect();
    session.realtimeAccessRole = null;
    session.realtimeConnection = null;
    session.realtimeVersion = 0;
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
      realtimeConnection,
      undoManager,
    } = moduleState.activeWorkbookSession;
    realtimeConnection?.disconnect();
    doc.off("update", handleDocUpdate);
    undoManager?.off("stack-item-added", handleUndoStackChange);
    undoManager?.off("stack-item-popped", handleUndoStackChange);
    undoManager?.off("stack-cleared", handleUndoStackChange);
    undoManager?.destroy();
    await persistence?.destroy();
    doc.destroy();
    moduleState.activeWorkbookSession = null;
    resetCollaborationState();
  };

  const closeWorkbookRouteSession = async (
    workbookId: string,
    isSharedSession = false,
    requestedAccessRole: CollaborationAccessRole | null = null,
    expectedSessionId: number | null = null
  ): Promise<void> => {
    const activeWorkbookSession = moduleState.activeWorkbookSession;
    if (!activeWorkbookSession) {
      return;
    }

    if (
      expectedSessionId !== null &&
      activeWorkbookSession.sessionId !== expectedSessionId
    ) {
      return;
    }

    if (
      !(
        activeWorkbookSession.workbookId === workbookId &&
        activeWorkbookSession.isSharedSession === isSharedSession &&
        activeWorkbookSession.requestedAccessRole === requestedAccessRole
      )
    ) {
      return;
    }

    if (moduleState.currentAuthenticatedUser && activeWorkbookSession.dirty) {
      await flushRemoteWorkbookSync(activeWorkbookSession);
    }

    await destroyActiveWorkbookSession();
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
    syncLogger.debug("Scheduled debounced workbook snapshot sync.");
    moduleState.remoteSyncTimeout = setTimeout(() => {
      flushRemoteWorkbookSync(session).catch((error) => {
        syncLogger.error("Failed to flush workbook snapshot sync.", error);
        if (isActiveSession(session)) {
          set({
            lastSyncErrorMessage:
              error instanceof Error ? error.message : String(error),
            remoteSyncStatus: "error",
            saveState: "error",
          });
        }
      });
    }, options?.delayMs ?? CLOUD_SYNC_DEBOUNCE_MS);
  };

  const flushRemoteWorkbookSync = async (
    session: ActiveWorkbookSession | null,
    _options?: {
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
        "Skipped workbook snapshot sync because there are no local changes."
      );
      return false;
    }

    if (
      !(session.realtimeAccessRole === "editor" && session.realtimeConnection)
    ) {
      syncLogger.debug(
        "Skipped workbook snapshot sync because the realtime editor channel is unavailable."
      );
      if (isActiveSession(session)) {
        set({ remoteSyncStatus: "pending" });
      }
      return false;
    }

    if (isActiveSession(session)) {
      set({ remoteSyncStatus: "syncing" });
    }

    const localSnapshot = getWorkbookSnapshot(session.doc);
    const writeResult = await session.realtimeConnection.sendSnapshot(
      {
        activeSheetId: localSnapshot.activeSheetId,
        collaborationVersion: session.realtimeVersion,
        meta: localSnapshot.workbook,
        update: encodeStateAsUpdate(session.doc),
        version: get().remoteVersion ?? 0,
      },
      CLOUD_SYNC_CLIENT_ID
    );
    syncLogger.info(
      `Flushed workbook ${localSnapshot.workbook.id} through the realtime channel.`
    );
    session.dirty = false;
    if (isActiveSession(session)) {
      set({
        lastSyncErrorMessage: null,
        lastSyncedAt: getTimestampValue(writeResult.lastSyncedAt),
        remoteSyncStatus: "synced",
        remoteVersion: writeResult.version,
      });
    }
    await upsertWorkbookRegistryEntry(
      buildPersistedWorkbookMeta(
        localSnapshot.workbook,
        writeResult.lastSyncedAt,
        writeResult.version
      )
    );
    if (isActiveSession(session)) {
      await refreshWorkbookRegistry();
    }

    return true;
  };

  const reconcileRemoteWorkbooks = async (
    user: AuthenticatedUser
  ): Promise<void> => {
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
          CLOUD_SYNC_ORIGIN
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
    // sees a stable server view and the user gets deterministic error
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

      const writeResult = await cloudWorkbookStore.writeWorkbook(
        user.uid,
        localWorkbook,
        CLOUD_SYNC_CLIENT_ID
      );
      syncLogger.info(
        `Uploaded local workbook ${localWorkbook.meta.id} through Phoenix.`
      );

      set({
        lastSyncErrorMessage: null,
        lastSyncedAt: getTimestampValue(writeResult.lastSyncedAt),
        remoteVersion: writeResult.version,
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
    syncLogger.debug("Applied a workbook snapshot to local state.", {
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

  const shouldScheduleInitialSnapshotSync = (workbookId: string): boolean => {
    const persistedWorkbook = get().workbooks.find(
      (workbook) => workbook.id === workbookId
    );
    if (!persistedWorkbook) {
      return true;
    }

    const lastSyncedAt = getPersistedSyncTimestamp(
      persistedWorkbook.lastSyncedAt
    );
    return lastSyncedAt === null
      ? true
      : getTimestampValue(persistedWorkbook.updatedAt) > lastSyncedAt;
  };

  const ensureRealtimeWorkbookRecord = async (
    session: ActiveWorkbookSession
  ): Promise<void> => {
    const currentUser = moduleState.currentAuthenticatedUser;
    if (!(currentUser && !session.isSharedSession)) {
      return;
    }

    const localSnapshot = getWorkbookSnapshot(session.doc);
    const remoteWorkbook = await cloudWorkbookStore.readWorkbook(
      currentUser.uid,
      localSnapshot.workbook.id
    );
    if (remoteWorkbook) {
      return;
    }

    const writeResult = await cloudWorkbookStore.writeWorkbook(
      currentUser.uid,
      {
        activeSheetId: localSnapshot.activeSheetId,
        meta: localSnapshot.workbook,
        update: encodeStateAsUpdate(session.doc),
        version: get().remoteVersion ?? 0,
      },
      CLOUD_SYNC_CLIENT_ID
    );

    await upsertWorkbookRegistryEntry(
      buildPersistedWorkbookMeta(
        localSnapshot.workbook,
        writeResult.lastSyncedAt,
        writeResult.version
      )
    );

    if (isActiveSession(session)) {
      set({
        lastSyncErrorMessage: null,
        lastSyncedAt: getTimestampValue(writeResult.lastSyncedAt),
        remoteSyncStatus: "synced",
        remoteVersion: writeResult.version,
      });
    }

    await refreshWorkbookRegistry();
  };

  const connectRealtimeSession = async (
    session: ActiveWorkbookSession
  ): Promise<void> => {
    const currentUser = moduleState.currentAuthenticatedUser;
    if (!(currentUser || session.isSharedSession)) {
      disconnectRealtimeSession(session);
      resetCollaborationState();
      return;
    }

    if (!isActiveSession(session)) {
      return;
    }

    if (session.realtimeConnection) {
      return;
    }

    if (session.realtimeConnectPromise) {
      // Shared sessions can trigger auth reconciliation and route activation at
      // the same time; reuse the in-flight join so we do not race duplicate
      // Phoenix channel connections for the same workbook.
      await session.realtimeConnectPromise;
      return;
    }

    const connectPromise = (async (): Promise<void> => {
      const { workbookId } = session;
      set({
        collaborationAccessRole: null,
        collaborationErrorMessage: null,
        collaborationPeers: [],
        collaborationStatus: "connecting",
      });

      await ensureRealtimeWorkbookRecord(session);
      if (!isActiveSession(session)) {
        return;
      }

      const realtimeConnection = await connectWorkbookRealtimeChannel(
        currentUser?.uid ?? null,
        workbookId,
        session.requestedAccessRole,
        {
          onError: (error) => {
            syncLogger.error("Workbook realtime channel error.", error);
            if (isActiveSession(session)) {
              set({
                collaborationErrorMessage: error.message,
                collaborationStatus: "disconnected",
              });
            }
          },
          onPresence: (peers: CollaboratorPresence[]) => {
            if (isActiveSession(session)) {
              set({ collaborationPeers: peers });
            }
          },
          onSnapshot: ({ update, version }) => {
            if (!isActiveSession(session)) {
              return;
            }

            session.realtimeVersion = Math.max(
              session.realtimeVersion,
              version
            );
            applyUpdate(session.doc, update, REALTIME_SYNC_ORIGIN);
          },
          onStatusChange: (status) => {
            if (isActiveSession(session)) {
              set({ collaborationStatus: status });
            }
          },
          onSync: ({ update, version }) => {
            if (!isActiveSession(session)) {
              return;
            }

            session.realtimeVersion = Math.max(
              session.realtimeVersion,
              version
            );
            applyUpdate(session.doc, update, REALTIME_SYNC_ORIGIN);
          },
        }
      );

      if (!isActiveSession(session)) {
        realtimeConnection.disconnect();
        return;
      }

      session.realtimeAccessRole = realtimeConnection.accessRole;
      session.realtimeConnection = realtimeConnection;
      session.realtimeVersion = realtimeConnection.initialState.version;

      if (realtimeConnection.initialState.update) {
        applyUpdate(
          session.doc,
          realtimeConnection.initialState.update,
          REALTIME_SYNC_ORIGIN
        );
      }

      for (const pendingUpdate of realtimeConnection.initialState
        .pendingUpdates) {
        applyUpdate(session.doc, pendingUpdate, REALTIME_SYNC_ORIGIN);
      }

      applySnapshot(session.doc, { forceWorkerReset: true });
      if (!session.isSharedSession) {
        await persistActiveWorkbookMeta();
      }
      set({
        collaborationAccessRole: realtimeConnection.accessRole,
        collaborationErrorMessage: null,
        collaborationPeers: realtimeConnection.initialState.peers,
        collaborationStatus: "connected",
      });

      if (
        realtimeConnection.accessRole === "editor" &&
        (realtimeConnection.initialState.shouldInitializeFromClient ||
          shouldScheduleInitialSnapshotSync(workbookId))
      ) {
        session.dirty = true;
        scheduleRemoteWorkbookSync(session, { delayMs: 0 });
      }
    })();

    session.realtimeConnectPromise = connectPromise;

    try {
      await connectPromise;
    } finally {
      if (session.realtimeConnectPromise === connectPromise) {
        session.realtimeConnectPromise = null;
      }
    }
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
    isSharedSession = false,
    requestedAccessRole: CollaborationAccessRole | null = null
  ): Promise<number | null> => {
    const nextIsSharedSession = isSharedSession;
    const nextRequestedAccessRole = isSharedSession
      ? requestedAccessRole
      : null;

    syncLogger.debug("Activating workbook session.", {
      existingRequestedAccessRole:
        moduleState.activeWorkbookSession?.requestedAccessRole ?? null,
      existingSharedSession:
        moduleState.activeWorkbookSession?.isSharedSession ?? null,
      existingWorkbookId: moduleState.activeWorkbookSession?.workbookId ?? null,
      isSharedSession: nextIsSharedSession,
      requestedAccessRole: nextRequestedAccessRole,
      workbookId,
    });

    if (
      moduleState.activeWorkbookSession &&
      moduleState.activeWorkbookSession.isSharedSession ===
        nextIsSharedSession &&
      moduleState.activeWorkbookSession.requestedAccessRole ===
        nextRequestedAccessRole &&
      moduleState.activeWorkbookSession.workbookId === workbookId
    ) {
      syncLogger.debug("Reusing the active workbook session.", {
        isSharedSession: nextIsSharedSession,
        requestedAccessRole: nextRequestedAccessRole,
        workbookId,
      });
      syncUndoManager(moduleState.activeWorkbookSession.doc);
      applySnapshot(moduleState.activeWorkbookSession.doc);
      if (
        (moduleState.currentAuthenticatedUser ||
          moduleState.activeWorkbookSession.isSharedSession) &&
        !moduleState.activeWorkbookSession.realtimeConnection
      ) {
        connectRealtimeSession(moduleState.activeWorkbookSession).catch(
          (error) => {
            syncLogger.error(
              "Failed to reconnect the workbook realtime channel.",
              error
            );
          }
        );
      }
      return moduleState.activeWorkbookSession.sessionId;
    }

    moduleState.nextWorkbookActivationId += 1;
    const activationId = moduleState.nextWorkbookActivationId;
    set({ hydrationState: "loading", saveState: "saving" });
    syncLogger.debug("Opening a new workbook session.", {
      activationId,
      isSharedSession: nextIsSharedSession,
      requestedAccessRole: nextRequestedAccessRole,
      workbookId,
    });

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
      return null;
    }

    await destroyActiveWorkbookSession();

    if (!isCurrentWorkbookActivation(activationId)) {
      return null;
    }

    const doc = new Doc();
    const persistence = nextIsSharedSession
      ? null
      : attachWorkbookPersistence(workbookId, doc);
    moduleState.nextWorkbookSessionId += 1;

    if (persistence) {
      const hasSyncedPersistence =
        await waitForWorkbookPersistence(persistence);
      if (!hasSyncedPersistence) {
        syncLogger.warn(
          "Workbook persistence did not finish syncing before timeout; continuing with in-memory state.",
          {
            workbookId,
          }
        );
      }
    }

    if (!isCurrentWorkbookActivation(activationId)) {
      await persistence?.destroy();
      doc.destroy();
      return null;
    }

    const shouldSeedLocalWorkbook = await shouldSeedBlankWorkbook(
      doc,
      workbookId,
      nextIsSharedSession
    );

    if (!isCurrentWorkbookActivation(activationId)) {
      await persistence?.destroy();
      doc.destroy();
      return null;
    }

    if (shouldSeedLocalWorkbook) {
      ensureWorkbookInitialized(doc, {
        name: fallbackName,
        workbookId,
      });
    }

    if (shouldSeedLocalWorkbook || hasWorkbookDocumentState(doc)) {
      touchWorkbook(doc, getActiveSheetId(doc) ?? undefined);
    }

    const session: ActiveWorkbookSession = {
      dirty: false,
      doc,
      handleDocUpdate: () => undefined,
      handleUndoStackChange: () => undefined,
      isSharedSession: nextIsSharedSession,
      persistence,
      realtimeAccessRole: null,
      realtimeConnectPromise: null,
      realtimeConnection: null,
      requestedAccessRole: nextRequestedAccessRole,
      realtimeVersion: 0,
      sessionId: moduleState.nextWorkbookSessionId,
      undoManager: null,
      workbookId,
    };

    session.handleDocUpdate = (update: Uint8Array, origin: unknown) => {
      applySnapshot(doc);

      if (
        !(
          session.isSharedSession ||
          origin === CLOUD_SYNC_ORIGIN ||
          origin === REALTIME_SYNC_ORIGIN
        )
      ) {
        session.dirty = true;

        if (
          moduleState.currentAuthenticatedUser &&
          session.realtimeAccessRole === "editor" &&
          session.realtimeConnection
        ) {
          session.realtimeConnection
            .sendSync(update)
            .then((version) => {
              if (isActiveSession(session)) {
                session.realtimeVersion = Math.max(
                  session.realtimeVersion,
                  version
                );
                set({ collaborationErrorMessage: null });
              }
            })
            .catch((error) => {
              syncLogger.error(
                "Failed to push incremental workbook sync update.",
                error
              );
              if (isActiveSession(session)) {
                set({
                  collaborationErrorMessage:
                    error instanceof Error ? error.message : String(error),
                });
              }
            });
        }

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
      return null;
    }

    moduleState.activeWorkbookSession = session;
    syncUndoManager(doc);

    const shouldRenderLocalSnapshot =
      shouldSeedLocalWorkbook || hasWorkbookDocumentState(doc);

    if (shouldRenderLocalSnapshot) {
      applySnapshot(doc, { forceWorkerReset: true });
    } else {
      set({ hydrationState: "loading" });
    }

    if (moduleState.currentAuthenticatedUser || nextIsSharedSession) {
      connectRealtimeSession(session).catch((error) => {
        syncLogger.error(
          "Failed to connect the workbook realtime channel.",
          error
        );
      });
    }

    if (!nextIsSharedSession && hasWorkbookDocumentState(doc)) {
      persistActiveWorkbookMeta().catch((error) => {
        syncLogger.warn(
          "Failed to persist the active workbook metadata after activation.",
          error
        );
      });
    }

    return session.sessionId;
  };

  const initializeAuthSync = (): void => {
    if (moduleState.hasInitializedAuthSync) {
      return;
    }

    moduleState.hasInitializedAuthSync = true;
    onAuthStateChange((user) => {
      moduleState.currentAuthenticatedUser = user;
      clearRemoteSyncTimeout();
      set({
        isRemoteSyncAuthenticated: user !== null,
        remoteSyncStatus: user ? "idle" : "disabled",
      });

      if (!user) {
        if (moduleState.activeWorkbookSession) {
          disconnectRealtimeSession(moduleState.activeWorkbookSession);
          if (moduleState.activeWorkbookSession.isSharedSession) {
            connectRealtimeSession(moduleState.activeWorkbookSession).catch(
              (error) => {
                syncLogger.error(
                  "Failed to reconnect the shared workbook realtime channel as a guest.",
                  error
                );
              }
            );
          } else {
            resetCollaborationState();
          }
        } else {
          resetCollaborationState();
        }
        set({
          lastSyncErrorMessage: null,
          lastSyncedAt: null,
          remoteVersion: null,
        });
        if (moduleState.hasResolvedInitialAuthState) {
          syncLogger.info("Signed out; paused cloud workbook syncing.");
        }

        moduleState.hasResolvedInitialAuthState = true;
        return;
      }

      moduleState.hasResolvedInitialAuthState = true;
      syncLogger.info(
        `Signed in as ${user.uid}; starting workbook reconciliation.`
      );

      const activeWorkbookSession = moduleState.activeWorkbookSession;
      if (activeWorkbookSession?.isSharedSession) {
        connectRealtimeSession(activeWorkbookSession).catch((error) => {
          syncLogger.error(
            "Failed to connect the shared workbook realtime channel after login.",
            error
          );
        });
      }

      reconcileRemoteWorkbooks(user)
        .then(() => {
          if (!moduleState.activeWorkbookSession) {
            return undefined;
          }

          if (
            moduleState.activeWorkbookSession.isSharedSession &&
            moduleState.activeWorkbookSession.realtimeConnection
          ) {
            return undefined;
          }

          return connectRealtimeSession(moduleState.activeWorkbookSession);
        })
        .catch((error) => {
          syncLogger.error(
            "Failed to reconcile cloud workbooks after login.",
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

  const publishCollaborationPresence = (payload: {
    activeCell: { col: number; row: number } | null;
    selection: CollaboratorSelectionRange | null;
    sheetId: string | null;
  }): void => {
    const activeWorkbookSession = moduleState.activeWorkbookSession;
    if (
      !(
        activeWorkbookSession?.realtimeConnection &&
        get().collaborationStatus === "connected"
      )
    ) {
      return;
    }

    activeWorkbookSession.realtimeConnection
      .sendPresence(payload)
      .catch((error) => {
        syncLogger.error("Failed to publish workbook presence.", error);
        if (isActiveSession(activeWorkbookSession)) {
          set({
            collaborationErrorMessage:
              error instanceof Error ? error.message : String(error),
          });
        }
      });
  };

  const publishCollaborationTyping = (payload: {
    typing: {
      cell: { col: number; row: number };
      draft: string;
      sheetId: string;
    } | null;
  }): void => {
    const activeWorkbookSession = moduleState.activeWorkbookSession;
    if (
      !(
        activeWorkbookSession?.realtimeConnection &&
        activeWorkbookSession.realtimeAccessRole === "editor" &&
        get().collaborationStatus === "connected"
      )
    ) {
      return;
    }

    activeWorkbookSession.realtimeConnection
      .sendTyping(payload)
      .catch((error) => {
        syncLogger.error("Failed to publish workbook typing state.", error);
        if (isActiveSession(activeWorkbookSession)) {
          set({
            collaborationErrorMessage:
              error instanceof Error ? error.message : String(error),
          });
        }
      });
  };

  return {
    activateWorkbook,
    buildColumnNames,
    closeActiveWorkbookSession: destroyActiveWorkbookSession,
    closeWorkbookRouteSession,
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
    publishCollaborationPresence,
    publishCollaborationTyping,
    syncUndoManager,
  };
};
