"use client";

import type {
  CollaborationAccessRole,
  CollaborationClientMessage,
  CollaborationServerMessage,
  CollaboratorIdentity,
  CollaboratorPresence,
} from "@papyrus/core/collaboration-types";
import {
  createSheetUndoManager,
  ensureWorkbookInitialized,
  getActiveSheetId,
  getWorkbookMeta,
  getWorkbookSnapshot,
  resetWorkbook,
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
import type { WorkbookMeta } from "@papyrus/core/workbook-types";
import { createLogger } from "@papyrus/logs";
import { onAuthStateChanged, type User } from "firebase/auth";
import { applyUpdate, Doc, encodeStateAsUpdate, type UndoManager } from "yjs";
import { firebaseAuth } from "@/web/features/auth/lib/firebase-auth";
import {
  acquireWorkbookSyncLease,
  listRemoteWorkbooks,
  type RemoteWorkbookState,
  readRemoteWorkbook,
  writeRemoteWorkbook,
} from "@/web/features/spreadsheet/lib/firestore-workbook-sync";
import { upsertSharedWorkbookAccess } from "@/web/features/spreadsheet/lib/share-registry";
import { colToLetter } from "@/web/features/spreadsheet/lib/spreadsheet-engine";
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
  collaborationReconnectTimeout: ReturnType<typeof setTimeout> | null;
  collaborationServerUrl: string | null;
  collaborationSocket: WebSocket | null;
  collaborationSocketWorkbookId: string | null;
  collaborationWorkbookId: string | null;
  currentAuthenticatedUser: User | null;
  currentCollaborationIdentity: CollaboratorIdentity | null;
  currentCollaborationIsSharedSession: boolean;
  currentCollaborationRole: CollaborationAccessRole | null;
  hasInitializedAuthSync: boolean;
  hasResolvedInitialAuthState: boolean;
  nextWorkbookActivationId: number;
  nextWorkbookSessionId: number;
  realtimeConnectionId: number;
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
  fillColumnNames: (columnNames: string[], targetLength: number) => string[];
  flushActiveRemoteWorkbookSync: (options?: {
    retryDelayMs?: number;
    scheduleRetryOnLeaseFailure?: boolean;
  }) => Promise<boolean>;
  getActiveWorkbookSession: () => ActiveWorkbookSession | null;
  getCurrentAuthenticatedUser: () => User | null;
  initializeAuthSync: () => void;
  isViewerAccess: () => boolean;
  persistActiveWorkbookMeta: () => Promise<void>;
  sendRealtimeMessage: (message: CollaborationClientMessage) => void;
  setRealtimeConnection: (
    accessRole: CollaborationAccessRole,
    identity: CollaboratorIdentity,
    serverUrl: string,
    isSharedSession: boolean,
    workbookId: string
  ) => void;
  stopRealtime: () => void;
  syncActiveWorkbookShareAccess: () => Promise<void>;
  syncUndoManager: (doc: Doc) => void;
}

const moduleState: SpreadsheetStoreModuleState = {
  activeWorkbookSession: null,
  collaborationReconnectTimeout: null,
  collaborationServerUrl: null,
  collaborationSocket: null,
  collaborationSocketWorkbookId: null,
  collaborationWorkbookId: null,
  currentAuthenticatedUser: null,
  currentCollaborationIdentity: null,
  currentCollaborationIsSharedSession: false,
  currentCollaborationRole: null,
  hasInitializedAuthSync: false,
  hasResolvedInitialAuthState: false,
  realtimeConnectionId: 0,
  nextWorkbookActivationId: 0,
  nextWorkbookSessionId: 0,
  remoteSyncTimeout: null,
};

const FIRESTORE_SYNC_DEBOUNCE_MS = 2500;
const FIRESTORE_LEASE_RETRY_MS = 3000;
const FIRESTORE_SYNC_ORIGIN = "firestore-sync";
const FIRESTORE_SYNC_CLIENT_ID = crypto.randomUUID();
const REALTIME_SYNC_ORIGIN = "realtime-sync";
const syncLogger = createLogger({ scope: "spreadsheet-sync" });

const clearRemoteSyncTimeout = (): void => {
  if (!moduleState.remoteSyncTimeout) {
    return;
  }

  clearTimeout(moduleState.remoteSyncTimeout);
  moduleState.remoteSyncTimeout = null;
};

const clearCollaborationReconnectTimeout = (): void => {
  if (!moduleState.collaborationReconnectTimeout) {
    return;
  }

  clearTimeout(moduleState.collaborationReconnectTimeout);
  moduleState.collaborationReconnectTimeout = null;
};

const encodeUpdateToBase64 = (update: Uint8Array): string => {
  let binary = "";

  for (let index = 0; index < update.length; index += 0x80_00) {
    binary += String.fromCharCode(...update.subarray(index, index + 0x80_00));
  }

  return btoa(binary);
};

const decodeBase64ToUpdate = (value: string): Uint8Array => {
  const binary = atob(value);
  const result = new Uint8Array(binary.length);

  for (const [index, char] of Array.from(binary).entries()) {
    result[index] = char.charCodeAt(0);
  }

  return result;
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

const getWorkbookUpdatedAtFromEncodedUpdate = (
  encodedUpdate: string
): number => {
  const doc = new Doc();

  try {
    applyUpdate(doc, decodeBase64ToUpdate(encodedUpdate), REALTIME_SYNC_ORIGIN);
    return getTimestampValue(getWorkbookMeta(doc).updatedAt);
  } finally {
    doc.destroy();
  }
};

const toWebSocketUrl = (serverUrl: string, workbookId: string): string => {
  const url = new URL(`/collab/${workbookId}`, serverUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
};

const isActiveSession = (session: ActiveWorkbookSession): boolean => {
  return moduleState.activeWorkbookSession?.sessionId === session.sessionId;
};

const isCurrentWorkbookActivation = (activationId: number): boolean => {
  return moduleState.nextWorkbookActivationId === activationId;
};

const isCurrentRealtimeConnection = (
  realtimeConnectionId: number,
  sessionId: number,
  workbookId: string
): boolean => {
  return (
    moduleState.realtimeConnectionId === realtimeConnectionId &&
    moduleState.activeWorkbookSession?.sessionId === sessionId &&
    getWorkbookMeta(moduleState.activeWorkbookSession.doc).id === workbookId &&
    moduleState.collaborationWorkbookId === workbookId &&
    moduleState.collaborationServerUrl !== null &&
    moduleState.currentCollaborationIdentity !== null &&
    moduleState.currentCollaborationRole !== null
  );
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

const loadLocalWorkbookState = async (
  workbookId: string,
  fallbackName?: string
): Promise<RemoteWorkbookState> => {
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
  workbook: RemoteWorkbookState
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

  const syncEffectiveRealtimeAccessRole = (
    peers: CollaboratorPresence[]
  ): CollaborationAccessRole | null => {
    const currentClientId = moduleState.currentCollaborationIdentity?.clientId;
    if (!currentClientId) {
      return null;
    }

    const selfPeer = peers.find(
      (peer) => peer.identity.clientId === currentClientId
    );

    return selfPeer?.accessRole ?? null;
  };

  const stopRealtimeConnection = (): void => {
    clearCollaborationReconnectTimeout();
    moduleState.collaborationSocket?.close();
    moduleState.collaborationSocket = null;
    moduleState.collaborationSocketWorkbookId = null;
    set({
      collaborationErrorMessage: null,
      collaborationPeers: [],
      collaborationStatus: "disconnected",
    });
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
    await upsertSharedWorkbookAccess(
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
    moduleState.realtimeConnectionId += 1;
    stopRealtimeConnection();

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
    const hasLease = await acquireWorkbookSyncLease(
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

    const remoteWorkbook = await readRemoteWorkbook(
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
    await writeRemoteWorkbook(
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

  const connectRealtimeTransport = async (): Promise<void> => {
    if (
      !(
        moduleState.activeWorkbookSession &&
        moduleState.collaborationWorkbookId &&
        moduleState.collaborationServerUrl &&
        moduleState.currentCollaborationIdentity &&
        moduleState.currentCollaborationRole
      )
    ) {
      return;
    }

    const activeWorkbookSession = moduleState.activeWorkbookSession;
    const activeWorkbookId = getWorkbookMeta(activeWorkbookSession.doc).id;
    if (
      activeWorkbookId.length === 0 ||
      activeWorkbookId !== moduleState.collaborationWorkbookId
    ) {
      return;
    }

    const sessionId = activeWorkbookSession.sessionId;
    const realtimeConnectionId = moduleState.realtimeConnectionId;
    clearCollaborationReconnectTimeout();

    if (
      moduleState.collaborationSocket &&
      moduleState.collaborationSocketWorkbookId === activeWorkbookId &&
      (moduleState.collaborationSocket.readyState === WebSocket.CONNECTING ||
        moduleState.collaborationSocket.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    moduleState.collaborationSocket?.close();
    moduleState.collaborationSocketWorkbookId = null;

    if (
      !isCurrentRealtimeConnection(
        realtimeConnectionId,
        sessionId,
        activeWorkbookId
      )
    ) {
      return;
    }

    const isSharedSession = moduleState.currentCollaborationIsSharedSession;
    const initialLocalSeedUpdate = encodeUpdateToBase64(
      encodeStateAsUpdate(activeWorkbookSession.doc)
    );

    const authToken = moduleState.currentAuthenticatedUser
      ? await moduleState.currentAuthenticatedUser
          .getIdToken()
          .catch(() => null)
      : null;

    if (
      !isCurrentRealtimeConnection(
        realtimeConnectionId,
        sessionId,
        activeWorkbookId
      )
    ) {
      return;
    }

    const wsUrl = new URL(
      toWebSocketUrl(moduleState.collaborationServerUrl, activeWorkbookId)
    );
    wsUrl.searchParams.set("accessRole", moduleState.currentCollaborationRole);
    if (authToken) {
      wsUrl.searchParams.set("authToken", authToken);
    }
    wsUrl.searchParams.set(
      "clientId",
      moduleState.currentCollaborationIdentity.clientId
    );
    wsUrl.searchParams.set(
      "color",
      moduleState.currentCollaborationIdentity.color
    );
    wsUrl.searchParams.set(
      "icon",
      moduleState.currentCollaborationIdentity.icon
    );
    wsUrl.searchParams.set(
      "isAnonymous",
      moduleState.currentCollaborationIdentity.isAnonymous ? "true" : "false"
    );
    wsUrl.searchParams.set(
      "name",
      moduleState.currentCollaborationIdentity.name
    );
    if (moduleState.currentCollaborationIdentity.photoURL) {
      wsUrl.searchParams.set(
        "photoURL",
        moduleState.currentCollaborationIdentity.photoURL
      );
    }

    set({
      collaborationAccessRole: null,
      collaborationErrorMessage: null,
      collaborationPeers: [],
      collaborationStatus: "connecting",
    });

    const socket = new WebSocket(wsUrl);
    let hasAppliedInitialSnapshot = false;
    moduleState.collaborationSocket = socket;
    moduleState.collaborationSocketWorkbookId = activeWorkbookId;

    socket.addEventListener("open", () => {
      if (
        moduleState.collaborationSocket !== socket ||
        !isCurrentRealtimeConnection(
          realtimeConnectionId,
          sessionId,
          activeWorkbookId
        )
      ) {
        return;
      }

      set({ collaborationStatus: "connected" });
    });

    socket.addEventListener("message", (event) => {
      if (
        moduleState.collaborationSocket !== socket ||
        !moduleState.activeWorkbookSession ||
        !isCurrentRealtimeConnection(
          realtimeConnectionId,
          sessionId,
          activeWorkbookId
        )
      ) {
        return;
      }

      const message = JSON.parse(
        typeof event.data === "string" ? event.data : "{}"
      ) as CollaborationServerMessage;

      if (message.type === "presence") {
        set({
          collaborationAccessRole: syncEffectiveRealtimeAccessRole(
            message.payload.peers
          ),
          collaborationErrorMessage: null,
          collaborationPeers: message.payload.peers,
        });
        return;
      }

      if (message.type === "snapshot") {
        const shouldSeedRoomFromLocalState =
          !isSharedSession &&
          moduleState.currentCollaborationRole === "editor" &&
          getTimestampValue(
            getWorkbookMeta(moduleState.activeWorkbookSession.doc).updatedAt
          ) > getWorkbookUpdatedAtFromEncodedUpdate(message.payload.update);

        if (isSharedSession && !hasAppliedInitialSnapshot) {
          resetWorkbook(
            moduleState.activeWorkbookSession.doc,
            REALTIME_SYNC_ORIGIN
          );
        }

        applyUpdate(
          moduleState.activeWorkbookSession.doc,
          decodeBase64ToUpdate(message.payload.update),
          REALTIME_SYNC_ORIGIN
        );
        hasAppliedInitialSnapshot = true;

        if (isSharedSession) {
          applySnapshot(moduleState.activeWorkbookSession.doc);
        }

        set({
          collaborationAccessRole: syncEffectiveRealtimeAccessRole(
            message.payload.peers
          ),
          collaborationErrorMessage: null,
          collaborationPeers: message.payload.peers,
        });

        if (
          (isSharedSession &&
            moduleState.currentCollaborationRole === "editor" &&
            message.payload.shouldInitializeFromClient) ||
          shouldSeedRoomFromLocalState
        ) {
          socket.send(
            JSON.stringify({
              payload: {
                update: initialLocalSeedUpdate,
              },
              type: "sync",
            } satisfies CollaborationClientMessage)
          );
        }

        return;
      }

      applyUpdate(
        moduleState.activeWorkbookSession.doc,
        decodeBase64ToUpdate(message.payload.update),
        REALTIME_SYNC_ORIGIN
      );
    });

    socket.addEventListener("close", (event) => {
      if (
        moduleState.collaborationSocket !== socket ||
        moduleState.realtimeConnectionId !== realtimeConnectionId
      ) {
        return;
      }

      const isAccessDenied = event.code === 4403;
      const collaborationErrorMessage =
        event.reason === "sharing-disabled"
          ? "Sharing is currently turned off for this workbook."
          : event.reason === "invalid-owner-token"
            ? "Your owner session could not be verified."
            : event.reason === "missing-share-config"
              ? "This workbook is not configured for sharing yet."
              : event.reason === "share-config-unavailable"
                ? "Share access could not be verified right now."
                : null;

      set({
        collaborationAccessRole: null,
        collaborationErrorMessage,
        collaborationPeers: [],
        collaborationStatus: "disconnected",
      });
      moduleState.collaborationSocket = null;
      moduleState.collaborationSocketWorkbookId = null;

      if (
        isAccessDenied ||
        !(
          moduleState.collaborationServerUrl &&
          moduleState.currentCollaborationIdentity
        )
      ) {
        return;
      }

      moduleState.collaborationReconnectTimeout = setTimeout(() => {
        if (
          !isCurrentRealtimeConnection(
            realtimeConnectionId,
            sessionId,
            activeWorkbookId
          )
        ) {
          return;
        }

        connectRealtimeTransport().catch(() => undefined);
      }, 1500);
    });

    socket.addEventListener("error", () => {
      if (
        moduleState.collaborationSocket !== socket ||
        moduleState.realtimeConnectionId !== realtimeConnectionId
      ) {
        return;
      }

      set({
        collaborationAccessRole: null,
        collaborationPeers: [],
        collaborationStatus: "disconnected",
      });
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
      connectRealtimeTransport().catch(() => undefined);
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
      const remoteWorkbook = await readRemoteWorkbook(
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

    session.handleDocUpdate = (update: Uint8Array, origin: unknown) => {
      applySnapshot(doc);

      if (!(session.isSharedSession || origin === FIRESTORE_SYNC_ORIGIN)) {
        session.dirty = true;
        scheduleRemoteWorkbookSync(session);
      }

      const socket = moduleState.collaborationSocket;
      if (
        origin === REALTIME_SYNC_ORIGIN ||
        !socket ||
        socket.readyState !== WebSocket.OPEN
      ) {
        return;
      }

      socket.send(
        JSON.stringify({
          payload: {
            update: encodeUpdateToBase64(update),
          },
          type: "sync",
        } satisfies CollaborationClientMessage)
      );
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
    connectRealtimeTransport().catch(() => undefined);
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
            connectRealtimeTransport().catch(() => undefined);
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
    fillColumnNames,
    flushActiveRemoteWorkbookSync: (options) => {
      return flushRemoteWorkbookSync(
        moduleState.activeWorkbookSession,
        options
      );
    },
    getActiveWorkbookSession: () => moduleState.activeWorkbookSession,
    getCurrentAuthenticatedUser: () => moduleState.currentAuthenticatedUser,
    initializeAuthSync,
    isViewerAccess: () => get().collaborationAccessRole === "viewer",
    persistActiveWorkbookMeta,
    sendRealtimeMessage: (message) => {
      if (moduleState.collaborationSocket?.readyState !== WebSocket.OPEN) {
        return;
      }

      moduleState.collaborationSocket.send(JSON.stringify(message));
    },
    setRealtimeConnection: (
      accessRole,
      identity,
      serverUrl,
      isSharedSession,
      workbookId
    ) => {
      moduleState.realtimeConnectionId += 1;
      moduleState.collaborationWorkbookId = workbookId;
      moduleState.collaborationServerUrl = serverUrl;
      moduleState.currentCollaborationIdentity = identity;
      moduleState.currentCollaborationIsSharedSession = isSharedSession;
      moduleState.currentCollaborationRole = accessRole;
      set({ collaborationErrorMessage: null });
      connectRealtimeTransport().catch(() => undefined);
    },
    stopRealtime: () => {
      moduleState.realtimeConnectionId += 1;
      moduleState.collaborationWorkbookId = null;
      moduleState.collaborationServerUrl = null;
      moduleState.currentCollaborationIdentity = null;
      moduleState.currentCollaborationIsSharedSession = false;
      moduleState.currentCollaborationRole = null;
      set({ collaborationAccessRole: null, collaborationErrorMessage: null });
      stopRealtimeConnection();
    },
    syncActiveWorkbookShareAccess,
    syncUndoManager,
  };
};
