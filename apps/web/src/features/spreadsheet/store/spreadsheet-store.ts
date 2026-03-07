"use client";

import type {
  CollaborationAccessRole,
  CollaborationClientMessage,
  CollaborationServerMessage,
  CollaboratorIdentity,
  CollaboratorPresence,
} from "@papyrus/core/collaboration-types";
import {
  createSheet,
  createSheetUndoManager,
  createWorkbookId,
  ensureWorkbookInitialized,
  getActiveSheetId,
  getWorkbookMeta,
  getWorkbookSnapshot,
  renameSheetColumn,
  renameWorkbook as renameWorkbookInDoc,
  replaceSheetCells,
  replaceSheetColumns,
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
import { createLogger } from "@papyrus/logs";
import { onAuthStateChanged, type User } from "firebase/auth";
import { applyUpdate, Doc, encodeStateAsUpdate, type UndoManager } from "yjs";
import { create } from "zustand";
import { firebaseAuth } from "@/web/features/auth/lib/firebase-auth";
import {
  acquireWorkbookSyncLease,
  deleteRemoteWorkbook,
  listRemoteWorkbooks,
  type RemoteWorkbookState,
  readRemoteWorkbook,
  writeRemoteWorkbook,
} from "@/web/features/spreadsheet/lib/firestore-workbook-sync";
import {
  cellId,
  colToLetter,
  isValidColumnName,
  normalizeColumnName,
  parseStoredCellId,
  rewriteFormulaColumnName,
  rewriteFormulaReferences,
} from "@/web/features/spreadsheet/lib/spreadsheet-engine";

type HydrationState = "error" | "idle" | "loading" | "ready";
type RemoteSyncStatus =
  | "disabled"
  | "error"
  | "idle"
  | "pending"
  | "syncing"
  | "synced";
type SaveState = "error" | "saved" | "saving";

interface SpreadsheetStoreState {
  activeSheetCells: Record<string, PersistedCellRecord>;
  activeSheetColumns: SheetColumn[];
  activeSheetId: string | null;
  activeWorkbook: WorkbookMeta | null;
  canRedo: boolean;
  canUndo: boolean;
  collaborationAccessRole: CollaborationAccessRole | null;
  collaborationPeers: CollaboratorPresence[];
  collaborationStatus: "connected" | "connecting" | "disconnected";
  connectRealtime: (
    accessRole: CollaborationAccessRole,
    identity: CollaboratorIdentity,
    serverUrl: string
  ) => void;
  createSheet: () => Promise<void>;
  createWorkbook: () => Promise<void>;
  deleteColumns: (startColumn: number, columnCount: number) => Promise<void>;
  deleteRows: (startRow: number, rowCount: number) => Promise<void>;
  deleteWorkbook: () => Promise<void>;
  hydrateWorkbookList: () => Promise<void>;
  hydrationState: HydrationState;
  isRemoteSyncAuthenticated: boolean;
  lastSyncErrorMessage: string | null;
  lastSyncedAt: number | null;
  manualSyncCooldownUntil: number;
  openWorkbook: (workbookId: string, name?: string) => Promise<void>;
  redo: () => Promise<void>;
  remoteSyncStatus: RemoteSyncStatus;
  remoteVersion: number | null;
  renameColumn: (columnIndex: number, columnName: string) => Promise<boolean>;
  renameWorkbook: (name: string) => Promise<void>;
  saveState: SaveState;
  setActiveSheet: (sheetId: string) => Promise<void>;
  setCellValue: (row: number, col: number, raw: string) => Promise<void>;
  setCellValuesByKey: (values: Record<string, string>) => Promise<void>;
  setWorkbookFavorite: (isFavorite: boolean) => Promise<void>;
  sheets: SheetMeta[];
  stopRealtime: () => void;
  syncNow: () => Promise<boolean>;
  undo: () => Promise<void>;
  updateRealtimePresence: (
    activeCell: { col: number; row: number } | null
  ) => void;
  workbooks: WorkbookMeta[];
  workerResetKey: string;
}

type WorkbookPersistence = ReturnType<typeof attachWorkbookPersistence>;

interface ActiveWorkbookSession {
  doc: Doc;
  handleDocUpdate: (update: Uint8Array, origin: unknown) => void;
  handleUndoStackChange: () => void;
  persistence: WorkbookPersistence;
  undoManager: UndoManager | null;
}

let activeWorkbookSession: ActiveWorkbookSession | null = null;
let collaborationReconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let collaborationSocket: WebSocket | null = null;
let collaborationServerUrl: string | null = null;
let currentCollaborationIdentity: CollaboratorIdentity | null = null;
let currentCollaborationRole: CollaborationAccessRole | null = null;
let currentAuthenticatedUser: User | null = null;
let remoteSyncTimeout: ReturnType<typeof setTimeout> | null = null;
let hasInitializedAuthSync = false;
let hasResolvedInitialAuthState = false;
let isActiveWorkbookDirty = false;

const FIRESTORE_SYNC_DEBOUNCE_MS = 2500;
const FIRESTORE_SYNC_ORIGIN = "firestore-sync";
const FIRESTORE_SYNC_CLIENT_ID = crypto.randomUUID();
const MANUAL_SYNC_COOLDOWN_MS = 5000;
const REALTIME_SYNC_ORIGIN = "realtime-sync";
const syncLogger = createLogger({ scope: "spreadsheet-sync" });

function clearRemoteSyncTimeout() {
  if (!remoteSyncTimeout) {
    return;
  }

  clearTimeout(remoteSyncTimeout);
  remoteSyncTimeout = null;
}

function clearCollaborationReconnectTimeout(): void {
  if (!collaborationReconnectTimeout) {
    return;
  }

  clearTimeout(collaborationReconnectTimeout);
  collaborationReconnectTimeout = null;
}

function encodeUpdateToBase64(update: Uint8Array): string {
  let binary = "";

  for (let index = 0; index < update.length; index += 0x80_00) {
    binary += String.fromCharCode(...update.subarray(index, index + 0x80_00));
  }

  return btoa(binary);
}

function decodeBase64ToUpdate(value: string): Uint8Array {
  const binary = atob(value);
  const result = new Uint8Array(binary.length);

  for (const [index, char] of Array.from(binary).entries()) {
    result[index] = char.charCodeAt(0);
  }

  return result;
}

function toWebSocketUrl(serverUrl: string, workbookId: string): string {
  const url = new URL(`/collab/${workbookId}`, serverUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function getTimestampValue(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

async function loadLocalWorkbookState(
  workbookId: string,
  fallbackName?: string
): Promise<RemoteWorkbookState> {
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
}

async function persistRemoteWorkbookLocally(
  workbook: RemoteWorkbookState
): Promise<void> {
  const doc = new Doc();
  const persistence = attachWorkbookPersistence(workbook.meta.id, doc);

  try {
    await waitForWorkbookPersistence(persistence);
    applyUpdate(doc, workbook.update, FIRESTORE_SYNC_ORIGIN);
    await upsertWorkbookRegistryEntry(getWorkbookMeta(doc));
  } finally {
    await persistence.destroy();
    doc.destroy();
  }
}

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

  const {
    doc,
    handleDocUpdate,
    handleUndoStackChange,
    persistence,
    undoManager,
  } = activeWorkbookSession;
  doc.off("update", handleDocUpdate);
  undoManager?.off("stack-item-added", handleUndoStackChange);
  undoManager?.off("stack-item-popped", handleUndoStackChange);
  undoManager?.off("stack-cleared", handleUndoStackChange);
  undoManager?.destroy();
  await persistence.destroy();
  doc.destroy();
  activeWorkbookSession = null;
}

function getUndoState(undoManager: UndoManager | null): {
  canRedo: boolean;
  canUndo: boolean;
} {
  return {
    canRedo: (undoManager?.redoStack.length ?? 0) > 0,
    canUndo: (undoManager?.undoStack.length ?? 0) > 0,
  };
}

function buildColumnNames(columns: SheetColumn[]): string[] {
  return columns.map((column) => column.name);
}

function fillColumnNames(
  columnNames: string[],
  targetLength: number
): string[] {
  const nextColumnNames = [...columnNames];

  while (nextColumnNames.length < targetLength) {
    nextColumnNames.push(colToLetter(nextColumnNames.length));
  }

  return nextColumnNames;
}

async function flushRemoteWorkbookSync(
  set: (partial: Partial<SpreadsheetStoreState>) => void
): Promise<void> {
  if (!(currentAuthenticatedUser && activeWorkbookSession)) {
    return;
  }

  if (!isActiveWorkbookDirty) {
    syncLogger.debug(
      "Skipped Firestore sync because there are no local workbook changes."
    );
    return;
  }

  set({ remoteSyncStatus: "syncing" });

  const localSnapshot = getWorkbookSnapshot(activeWorkbookSession.doc);
  const currentUserId = currentAuthenticatedUser.uid;
  const hasLease = await acquireWorkbookSyncLease(
    currentUserId,
    localSnapshot.workbook.id,
    FIRESTORE_SYNC_CLIENT_ID
  );
  if (!hasLease) {
    syncLogger.debug(
      `Skipped Firestore sync for workbook ${localSnapshot.workbook.id}; another client holds the lease.`
    );
    return;
  }

  const remoteWorkbook = await readRemoteWorkbook(
    currentUserId,
    localSnapshot.workbook.id
  );

  if (remoteWorkbook) {
    syncLogger.debug(
      `Merging remote Firestore state into workbook ${localSnapshot.workbook.id} before upload.`
    );
    applyUpdate(
      activeWorkbookSession.doc,
      remoteWorkbook.update,
      FIRESTORE_SYNC_ORIGIN
    );
  }

  const mergedSnapshot = getWorkbookSnapshot(activeWorkbookSession.doc);
  await writeRemoteWorkbook(
    currentUserId,
    {
      activeSheetId: mergedSnapshot.activeSheetId,
      meta: mergedSnapshot.workbook,
      update: encodeStateAsUpdate(activeWorkbookSession.doc),
      version: remoteWorkbook?.version ?? 0,
    },
    FIRESTORE_SYNC_CLIENT_ID
  );
  syncLogger.info(
    `Synced workbook ${mergedSnapshot.workbook.id} to Firestore for ${currentUserId}.`
  );
  isActiveWorkbookDirty = false;
  set({
    lastSyncErrorMessage: null,
    lastSyncedAt: Date.now(),
    remoteSyncStatus: "synced",
    remoteVersion: (remoteWorkbook?.version ?? 0) + 1,
  });
  await upsertWorkbookRegistryEntry(mergedSnapshot.workbook);
  await refreshWorkbookRegistry(set);
}

function scheduleRemoteWorkbookSync(
  set: (partial: Partial<SpreadsheetStoreState>) => void
) {
  if (!(currentAuthenticatedUser && activeWorkbookSession)) {
    return;
  }

  if (!isActiveWorkbookDirty) {
    return;
  }

  clearRemoteSyncTimeout();
  set({ remoteSyncStatus: "pending" });
  syncLogger.debug("Scheduled debounced Firestore workbook sync.");
  remoteSyncTimeout = setTimeout(() => {
    flushRemoteWorkbookSync(set).catch((error) => {
      syncLogger.error("Failed to flush Firestore workbook sync.", error);
      set({
        lastSyncErrorMessage:
          error instanceof Error ? error.message : String(error),
        remoteSyncStatus: "error",
        saveState: "error",
      });
    });
  }, FIRESTORE_SYNC_DEBOUNCE_MS);
}

async function reconcileRemoteWorkbooks(
  set: (partial: Partial<SpreadsheetStoreState>) => void,
  get: () => SpreadsheetStoreState,
  user: User
): Promise<void> {
  const localWorkbooks = sortWorkbooks(await listWorkbookRegistryEntries());
  const remoteWorkbooks = sortWorkbooks(await listRemoteWorkbooks(user.uid));
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
    if (
      localWorkbookMeta &&
      getTimestampValue(localWorkbookMeta.updatedAt) >=
        getTimestampValue(remoteWorkbookMeta.updatedAt)
    ) {
      continue;
    }

    const remoteWorkbook = await readRemoteWorkbook(
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
      activeWorkbookSession
    ) {
      syncLogger.debug(
        `Applying remote workbook ${remoteWorkbook.meta.id} into the active Yjs doc.`
      );
      applyUpdate(
        activeWorkbookSession.doc,
        remoteWorkbook.update,
        FIRESTORE_SYNC_ORIGIN
      );
      await upsertWorkbookRegistryEntry(
        getWorkbookMeta(activeWorkbookSession.doc)
      );
      continue;
    }

    syncLogger.info(
      `Hydrating remote workbook ${remoteWorkbook.meta.id} into IndexedDB.`
    );
    await persistRemoteWorkbookLocally(remoteWorkbook);
  }

  for (const localWorkbookMeta of localWorkbooks) {
    const remoteWorkbookMeta = remoteById.get(localWorkbookMeta.id);
    if (
      remoteWorkbookMeta &&
      getTimestampValue(remoteWorkbookMeta.updatedAt) >=
        getTimestampValue(localWorkbookMeta.updatedAt)
    ) {
      continue;
    }

    const localWorkbook =
      get().activeWorkbook?.id === localWorkbookMeta.id && activeWorkbookSession
        ? {
            activeSheetId: getActiveSheetId(activeWorkbookSession.doc),
            meta: getWorkbookMeta(activeWorkbookSession.doc),
            update: encodeStateAsUpdate(activeWorkbookSession.doc),
            version: 0,
          }
        : await loadLocalWorkbookState(
            localWorkbookMeta.id,
            localWorkbookMeta.name
          );

    await writeRemoteWorkbook(
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

    if (get().activeWorkbook?.id === localWorkbook.meta.id) {
      isActiveWorkbookDirty = false;
    }
  }

  set({ remoteSyncStatus: "synced" });
  await refreshWorkbookRegistry(set);
}

export const useSpreadsheetStore = create<SpreadsheetStoreState>((set, get) => {
  const isViewerAccess = () => get().collaborationAccessRole === "viewer";

  const stopRealtimeConnection = () => {
    clearCollaborationReconnectTimeout();
    collaborationSocket?.close();
    collaborationSocket = null;
    set({
      collaborationPeers: [],
      collaborationStatus: "disconnected",
    });
  };

  const connectRealtimeTransport = () => {
    if (
      !(
        activeWorkbookSession &&
        get().activeWorkbook &&
        collaborationServerUrl &&
        currentCollaborationIdentity &&
        currentCollaborationRole
      )
    ) {
      return;
    }

    clearCollaborationReconnectTimeout();
    collaborationSocket?.close();

    const activeWorkbook = get().activeWorkbook;
    if (!activeWorkbook) {
      return;
    }

    const wsUrl = new URL(
      toWebSocketUrl(collaborationServerUrl, activeWorkbook.id)
    );
    wsUrl.searchParams.set("accessRole", currentCollaborationRole);
    wsUrl.searchParams.set("clientId", currentCollaborationIdentity.clientId);
    wsUrl.searchParams.set("color", currentCollaborationIdentity.color);
    wsUrl.searchParams.set("icon", currentCollaborationIdentity.icon);
    wsUrl.searchParams.set(
      "isAnonymous",
      currentCollaborationIdentity.isAnonymous ? "true" : "false"
    );
    wsUrl.searchParams.set("name", currentCollaborationIdentity.name);
    if (currentCollaborationIdentity.photoURL) {
      wsUrl.searchParams.set("photoURL", currentCollaborationIdentity.photoURL);
    }

    set({
      collaborationAccessRole: currentCollaborationRole,
      collaborationPeers: [],
      collaborationStatus: "connecting",
    });

    const socket = new WebSocket(wsUrl);
    collaborationSocket = socket;

    socket.addEventListener("open", () => {
      if (!(activeWorkbookSession && currentCollaborationRole === "editor")) {
        set({ collaborationStatus: "connected" });
        return;
      }

      const syncMessage: CollaborationClientMessage = {
        type: "sync",
        payload: {
          update: encodeUpdateToBase64(
            encodeStateAsUpdate(activeWorkbookSession.doc)
          ),
        },
      };
      socket.send(JSON.stringify(syncMessage));
      set({ collaborationStatus: "connected" });
    });

    socket.addEventListener("message", (event) => {
      if (!activeWorkbookSession) {
        return;
      }

      const message = JSON.parse(
        typeof event.data === "string" ? event.data : "{}"
      ) as CollaborationServerMessage;

      if (message.type === "presence") {
        set({ collaborationPeers: message.payload.peers });
        return;
      }

      if (message.type === "snapshot") {
        applyUpdate(
          activeWorkbookSession.doc,
          decodeBase64ToUpdate(message.payload.update),
          REALTIME_SYNC_ORIGIN
        );
        set({ collaborationPeers: message.payload.peers });
        return;
      }

      applyUpdate(
        activeWorkbookSession.doc,
        decodeBase64ToUpdate(message.payload.update),
        REALTIME_SYNC_ORIGIN
      );
    });

    socket.addEventListener("close", () => {
      if (collaborationSocket !== socket) {
        return;
      }

      set({ collaborationStatus: "disconnected" });
      collaborationSocket = null;

      if (!(collaborationServerUrl && currentCollaborationIdentity)) {
        return;
      }

      collaborationReconnectTimeout = setTimeout(() => {
        connectRealtimeTransport();
      }, 1500);
    });

    socket.addEventListener("error", () => {
      set({ collaborationStatus: "disconnected" });
    });
  };

  const syncUndoManager = (doc: Doc) => {
    if (!activeWorkbookSession) {
      return;
    }

    activeWorkbookSession.undoManager?.off(
      "stack-item-added",
      activeWorkbookSession.handleUndoStackChange
    );
    activeWorkbookSession.undoManager?.off(
      "stack-item-popped",
      activeWorkbookSession.handleUndoStackChange
    );
    activeWorkbookSession.undoManager?.off(
      "stack-cleared",
      activeWorkbookSession.handleUndoStackChange
    );
    activeWorkbookSession.undoManager?.destroy();

    const undoManager = createSheetUndoManager(doc, getActiveSheetId(doc));
    const handleUndoStackChange = () => {
      set(getUndoState(undoManager));
    };

    undoManager?.on("stack-item-added", handleUndoStackChange);
    undoManager?.on("stack-item-popped", handleUndoStackChange);
    undoManager?.on("stack-cleared", handleUndoStackChange);

    activeWorkbookSession.undoManager = undoManager;
    activeWorkbookSession.handleUndoStackChange = handleUndoStackChange;
    set(getUndoState(undoManager));
  };

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
        ...getUndoState(activeWorkbookSession?.undoManager ?? null),
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

    const handleDocUpdate = (update: Uint8Array, origin: unknown) => {
      applySnapshot(doc);

      if (origin !== FIRESTORE_SYNC_ORIGIN) {
        isActiveWorkbookDirty = true;
        scheduleRemoteWorkbookSync(set);
      }

      if (
        !(
          origin !== REALTIME_SYNC_ORIGIN &&
          collaborationSocket?.readyState === WebSocket.OPEN &&
          currentCollaborationRole === "editor"
        )
      ) {
        return;
      }

      const syncMessage: CollaborationClientMessage = {
        type: "sync",
        payload: {
          update: encodeUpdateToBase64(update),
        },
      };
      collaborationSocket.send(JSON.stringify(syncMessage));
    };
    const handleUndoStackChange = () => {
      set(getUndoState(activeWorkbookSession?.undoManager ?? null));
    };

    doc.on("update", handleDocUpdate);

    activeWorkbookSession = {
      doc,
      handleDocUpdate,
      handleUndoStackChange,
      persistence,
      undoManager: null,
    };
    syncUndoManager(doc);
    isActiveWorkbookDirty = false;

    applySnapshot(doc, { forceWorkerReset: true });
    connectRealtimeTransport();
    await persistActiveWorkbookMeta(set);
  };

  if (!hasInitializedAuthSync) {
    hasInitializedAuthSync = true;
    onAuthStateChanged(firebaseAuth, (user) => {
      currentAuthenticatedUser = user;
      clearRemoteSyncTimeout();
      set({
        isRemoteSyncAuthenticated: user !== null,
        remoteSyncStatus: user ? "idle" : "disabled",
      });

      if (!user) {
        set({
          lastSyncErrorMessage: null,
          lastSyncedAt: null,
          remoteVersion: null,
        });
        if (hasResolvedInitialAuthState) {
          syncLogger.info("Signed out; paused Firestore workbook syncing.");
        }

        hasResolvedInitialAuthState = true;
        return;
      }

      hasResolvedInitialAuthState = true;
      syncLogger.info(
        `Signed in as ${user.uid}; starting workbook reconciliation.`
      );

      reconcileRemoteWorkbooks(set, get, user)
        .then(() => {
          if (activeWorkbookSession) {
            scheduleRemoteWorkbookSync(set);
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
  }

  return {
    activeSheetCells: {},
    activeSheetColumns: [],
    activeSheetId: null,
    activeWorkbook: null,
    canRedo: false,
    canUndo: false,
    collaborationAccessRole: null,
    collaborationPeers: [],
    collaborationStatus: "disconnected",
    connectRealtime: (accessRole, identity, serverUrl) => {
      collaborationServerUrl = serverUrl;
      currentCollaborationIdentity = identity;
      currentCollaborationRole = accessRole;
      set({ collaborationAccessRole: accessRole });
      connectRealtimeTransport();
    },
    createSheet: async () => {
      if (!activeWorkbookSession || isViewerAccess()) {
        return;
      }

      set({ saveState: "saving" });
      const nextSheet = createSheet(activeWorkbookSession.doc);
      setActiveSheetInDoc(activeWorkbookSession.doc, nextSheet.id);
      syncUndoManager(activeWorkbookSession.doc);
      await persistActiveWorkbookMeta(set);
    },
    createWorkbook: async () => {
      const nextWorkbookId = createWorkbookId();
      await activateWorkbook(nextWorkbookId);
    },
    deleteColumns: async (startColumn, columnCount) => {
      if (isViewerAccess()) {
        return;
      }

      const activeSheetId = get().activeSheetId;
      if (!(activeWorkbookSession && activeSheetId)) {
        return;
      }

      const currentColumns = buildColumnNames(get().activeSheetColumns);
      const currentColumnCount = currentColumns.length;
      if (
        columnCount <= 0 ||
        startColumn < 0 ||
        startColumn >= currentColumnCount
      ) {
        return;
      }

      const endColumn = Math.min(currentColumnCount, startColumn + columnCount);
      const removedColumnCount = endColumn - startColumn;
      const nextColumns = fillColumnNames(
        currentColumns.filter(
          (_columnName, index) => index < startColumn || index >= endColumn
        ),
        currentColumnCount
      );

      const nextCells: Record<string, string> = {};
      for (const [storedCellKey, cellValue] of Object.entries(
        get().activeSheetCells
      )) {
        const position = parseStoredCellId(storedCellKey);
        if (!position) {
          continue;
        }

        if (position.col >= startColumn && position.col < endColumn) {
          continue;
        }

        const nextCol =
          position.col >= endColumn
            ? position.col - removedColumnCount
            : position.col;
        nextCells[cellId(position.row, nextCol)] = rewriteFormulaReferences(
          cellValue.raw,
          currentColumns,
          nextColumns,
          (referencePosition) => {
            if (
              referencePosition.col >= startColumn &&
              referencePosition.col < endColumn
            ) {
              return "deleted";
            }

            if (referencePosition.col >= endColumn) {
              return {
                col: referencePosition.col - removedColumnCount,
                row: referencePosition.row,
              };
            }

            return referencePosition;
          }
        );
      }

      set({ saveState: "saving" });
      replaceSheetColumns(
        activeWorkbookSession.doc,
        activeSheetId,
        nextColumns
      );
      replaceSheetCells(activeWorkbookSession.doc, activeSheetId, nextCells);
      await persistActiveWorkbookMeta(set);
    },
    deleteRows: async (startRow, rowCount) => {
      if (isViewerAccess()) {
        return;
      }

      const activeSheetId = get().activeSheetId;
      if (!(activeWorkbookSession && activeSheetId)) {
        return;
      }

      if (rowCount <= 0 || startRow < 0) {
        return;
      }

      const endRow = startRow + rowCount;
      const currentColumns = buildColumnNames(get().activeSheetColumns);
      const nextCells: Record<string, string> = {};

      for (const [storedCellKey, cellValue] of Object.entries(
        get().activeSheetCells
      )) {
        const position = parseStoredCellId(storedCellKey);
        if (!position) {
          continue;
        }

        if (position.row >= startRow && position.row < endRow) {
          continue;
        }

        const nextRow =
          position.row >= endRow ? position.row - rowCount : position.row;
        nextCells[cellId(nextRow, position.col)] = rewriteFormulaReferences(
          cellValue.raw,
          currentColumns,
          currentColumns,
          (referencePosition) => {
            if (
              referencePosition.row >= startRow &&
              referencePosition.row < endRow
            ) {
              return "deleted";
            }

            if (referencePosition.row >= endRow) {
              return {
                col: referencePosition.col,
                row: referencePosition.row - rowCount,
              };
            }

            return referencePosition;
          }
        );
      }

      set({ saveState: "saving" });
      replaceSheetCells(activeWorkbookSession.doc, activeSheetId, nextCells);
      await persistActiveWorkbookMeta(set);
    },
    deleteWorkbook: async () => {
      if (isViewerAccess()) {
        return;
      }

      const workbookId = get().activeWorkbook?.id;
      if (!workbookId) {
        return;
      }

      set({ hydrationState: "loading", saveState: "saving" });

      try {
        if (currentAuthenticatedUser) {
          await deleteRemoteWorkbook(currentAuthenticatedUser.uid, workbookId);
        }

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
    isRemoteSyncAuthenticated: false,
    lastSyncErrorMessage: null,
    lastSyncedAt: null,
    manualSyncCooldownUntil: 0,
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
      if (isViewerAccess()) {
        return false;
      }

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
      if (!activeWorkbookSession || isViewerAccess()) {
        return;
      }

      set({ saveState: "saving" });
      renameWorkbookInDoc(activeWorkbookSession.doc, name);
      await persistActiveWorkbookMeta(set);
    },
    redo: async () => {
      if (
        !(
          activeWorkbookSession?.undoManager &&
          activeWorkbookSession.undoManager.redoStack.length > 0
        )
      ) {
        return;
      }

      set({ saveState: "saving" });
      activeWorkbookSession.undoManager.redo();
      await persistActiveWorkbookMeta(set);
    },
    remoteVersion: null,
    remoteSyncStatus: "disabled",
    saveState: "saved",
    syncNow: async () => {
      if (!(currentAuthenticatedUser && activeWorkbookSession)) {
        syncLogger.warn(
          "Manual sync requested without an authenticated active workbook session."
        );
        return false;
      }

      if (!isActiveWorkbookDirty) {
        syncLogger.debug(
          "Manual sync skipped because there are no local workbook changes."
        );
        return false;
      }

      const now = Date.now();
      if (now < get().manualSyncCooldownUntil) {
        syncLogger.debug(
          "Manual sync skipped because the cooldown is still active."
        );
        return false;
      }

      set({
        manualSyncCooldownUntil: now + MANUAL_SYNC_COOLDOWN_MS,
        saveState: "saving",
      });
      clearRemoteSyncTimeout();

      try {
        await flushRemoteWorkbookSync(set);
        return true;
      } catch (error) {
        syncLogger.error("Manual Firestore sync failed.", error);
        set({
          lastSyncErrorMessage:
            error instanceof Error ? error.message : String(error),
          remoteSyncStatus: "error",
          saveState: "error",
        });
        return false;
      }
    },
    setActiveSheet: async (sheetId) => {
      if (!activeWorkbookSession) {
        return;
      }

      set({ saveState: "saving" });
      setActiveSheetInDoc(activeWorkbookSession.doc, sheetId);
      touchWorkbook(activeWorkbookSession.doc, sheetId);
      syncUndoManager(activeWorkbookSession.doc);
      await persistActiveWorkbookMeta(set);
    },
    setCellValuesByKey: (values) => {
      if (isViewerAccess()) {
        return Promise.resolve();
      }

      const activeSheetId = get().activeSheetId;
      if (!(activeWorkbookSession && activeSheetId)) {
        return Promise.resolve();
      }

      set({ saveState: "saving" });
      setSheetCellValues(activeWorkbookSession.doc, activeSheetId, values);
      return persistActiveWorkbookMeta(set);
    },
    setCellValue: (row, col, raw) => {
      if (isViewerAccess()) {
        return Promise.resolve();
      }

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
      if (!activeWorkbookSession || isViewerAccess()) {
        return;
      }

      set({ saveState: "saving" });
      setWorkbookFavorite(activeWorkbookSession.doc, isFavorite);
      await persistActiveWorkbookMeta(set);
    },
    sheets: [],
    stopRealtime: () => {
      collaborationServerUrl = null;
      currentCollaborationIdentity = null;
      currentCollaborationRole = null;
      set({ collaborationAccessRole: null });
      stopRealtimeConnection();
    },
    undo: async () => {
      if (
        !(
          activeWorkbookSession?.undoManager &&
          activeWorkbookSession.undoManager.undoStack.length > 0
        )
      ) {
        return;
      }

      set({ saveState: "saving" });
      activeWorkbookSession.undoManager.undo();
      await persistActiveWorkbookMeta(set);
    },
    updateRealtimePresence: (activeCell) => {
      if (collaborationSocket?.readyState !== WebSocket.OPEN) {
        return;
      }

      const message: CollaborationClientMessage = {
        type: "presence",
        payload: {
          activeCell,
        },
      };
      collaborationSocket.send(JSON.stringify(message));
    },
    workerResetKey: "initial",
    workbooks: [],
  };
});
