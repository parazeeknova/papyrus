"use client";

import type {
  CollaborationAccessRole,
  CollaboratorPresence,
  CollaboratorSelectionRange,
} from "@papyrus/core/collaboration-types";
import type { WorkbookMeta } from "@papyrus/core/workbook-types";
import { createLogger } from "@papyrus/logs";
import type { Channel } from "phoenix";
import {
  buildCollaboratorIdentity,
  isCollaborationAccessRole,
} from "@/web/features/workbook/collaboration/lib/collaboration";
import {
  ensurePhoenixSocketConnection,
  PHOENIX_CHANNEL_TIMEOUT_MS,
} from "@/web/platform/phoenix/socket-client";
import {
  decodeBase64ToBinary,
  encodeBinaryToBase64,
} from "@/web/platform/phoenix/update-base64";

const realtimeLogger = createLogger({ scope: "workbook-realtime-channel" });

type CollaborationStatus = "connected" | "connecting" | "disconnected";

interface RawCellPosition {
  col: number;
  row: number;
}

interface RawSelectionRange {
  end: RawCellPosition;
  mode: CollaboratorSelectionRange["mode"];
  start: RawCellPosition;
}

interface RawTypingState {
  cell: RawCellPosition;
  draft: string;
  sheetId: string;
}

interface RawRealtimePeer {
  accessRole: CollaborationAccessRole;
  activeCell: RawCellPosition | null;
  deviceId: string;
  email: string | null;
  selection: RawSelectionRange | null;
  sheetId: string | null;
  typing: RawTypingState | null;
  updatedAt: number;
  userId: string;
}

interface WorkbookRealtimeJoinResponse {
  accessRole: CollaborationAccessRole;
  peers: CollaboratorPresence[];
  pendingUpdates: Uint8Array[];
  shouldInitializeFromClient: boolean;
  update: Uint8Array | null;
  version: number;
  workbookId: string;
}

export interface WorkbookRealtimeSnapshotResult {
  lastSyncedAt: string;
  version: number;
}

export interface WorkbookRealtimeSnapshotPayload {
  activeSheetId: string | null;
  collaborationVersion: number;
  meta: WorkbookMeta;
  update: Uint8Array;
  version: number;
}

export interface WorkbookRealtimeCallbacks {
  onError?: (error: Error) => void;
  onPresence?: (peers: CollaboratorPresence[]) => void;
  onSnapshot?: (payload: { update: Uint8Array; version: number }) => void;
  onStatusChange?: (status: CollaborationStatus) => void;
  onSync?: (payload: { update: Uint8Array; version: number }) => void;
}

export interface WorkbookRealtimeChannelConnection {
  accessRole: CollaborationAccessRole;
  deviceId: string;
  disconnect: () => void;
  initialState: WorkbookRealtimeJoinResponse;
  sendPresence: (payload: {
    activeCell: RawCellPosition | null;
    selection: CollaboratorSelectionRange | null;
    sheetId: string | null;
  }) => Promise<CollaboratorPresence[]>;
  sendSnapshot: (
    payload: WorkbookRealtimeSnapshotPayload,
    clientId: string
  ) => Promise<WorkbookRealtimeSnapshotResult>;
  sendSync: (update: Uint8Array) => Promise<number>;
  sendTyping: (payload: {
    typing: { cell: RawCellPosition; draft: string; sheetId: string } | null;
  }) => Promise<CollaboratorPresence[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function normalizeChannelError(eventName: string, response: unknown): Error {
  if (isRecord(response) && typeof response.reason === "string") {
    return new Error(
      `Realtime request "${eventName}" failed: ${response.reason}.`
    );
  }

  return new Error(`Realtime request "${eventName}" failed.`);
}

function parseCellPosition(value: unknown): RawCellPosition | null {
  if (
    !isRecord(value) ||
    typeof value.col !== "number" ||
    typeof value.row !== "number"
  ) {
    return null;
  }

  return {
    col: value.col,
    row: value.row,
  };
}

function parseSelectionRange(
  value: unknown
): CollaboratorSelectionRange | null {
  if (
    !(
      isRecord(value) &&
      ["cells", "columns", "rows"].includes(String(value.mode))
    )
  ) {
    return null;
  }

  const start = parseCellPosition(value.start);
  const end = parseCellPosition(value.end);
  if (!(start && end)) {
    return null;
  }

  return {
    end,
    mode: value.mode as CollaboratorSelectionRange["mode"],
    start,
  };
}

function parseTypingState(value: unknown): RawTypingState | null {
  if (
    !isRecord(value) ||
    typeof value.draft !== "string" ||
    typeof value.sheetId !== "string"
  ) {
    return null;
  }

  const cell = parseCellPosition(value.cell);
  if (!cell) {
    return null;
  }

  return {
    cell,
    draft: value.draft,
    sheetId: value.sheetId,
  };
}

function parseRealtimePeer(value: unknown): RawRealtimePeer | null {
  if (
    !(isRecord(value) && isCollaborationAccessRole(value.accessRole)) ||
    typeof value.deviceId !== "string" ||
    typeof value.updatedAt !== "number" ||
    typeof value.userId !== "string"
  ) {
    return null;
  }

  if (!(value.email === null || typeof value.email === "string")) {
    return null;
  }

  const activeCell =
    value.activeCell === null ? null : parseCellPosition(value.activeCell);
  const selection =
    value.selection === null ? null : parseSelectionRange(value.selection);
  const typing = value.typing === null ? null : parseTypingState(value.typing);
  const sheetId =
    value.sheetId === null
      ? null
      : typeof value.sheetId === "string"
        ? value.sheetId
        : undefined;

  if (
    !(
      value.activeCell === null ||
      activeCell ||
      value.selection === null ||
      selection ||
      value.typing === null ||
      typing ||
      value.sheetId === null ||
      typeof sheetId === "string"
    )
  ) {
    return null;
  }

  if (sheetId === undefined) {
    return null;
  }

  return {
    accessRole: value.accessRole,
    activeCell,
    deviceId: value.deviceId,
    email: value.email,
    selection,
    sheetId,
    typing,
    updatedAt: value.updatedAt,
    userId: value.userId,
  };
}

function parseCollaborators(
  value: unknown,
  localDeviceId: string
): CollaboratorPresence[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.flatMap((peer) => {
    const parsedPeer = parseRealtimePeer(peer);
    if (!(parsedPeer && parsedPeer.deviceId !== localDeviceId)) {
      return [];
    }

    return [
      {
        accessRole: parsedPeer.accessRole,
        activeCell: parsedPeer.activeCell,
        identity: buildCollaboratorIdentity({
          deviceId: parsedPeer.deviceId,
          email: parsedPeer.email,
          userId: parsedPeer.userId,
        }),
        selection: parsedPeer.selection,
        sheetId: parsedPeer.sheetId,
        typing: parsedPeer.typing,
        updatedAt: parsedPeer.updatedAt,
      },
    ];
  });
}

function parsePresenceResponse(
  value: unknown,
  localDeviceId: string
): CollaboratorPresence[] | null {
  if (!isRecord(value)) {
    return null;
  }

  return parseCollaborators(value.peers, localDeviceId);
}

function parseJoinResponse(
  value: unknown,
  localDeviceId: string
): WorkbookRealtimeJoinResponse | null {
  if (
    !(isRecord(value) && isCollaborationAccessRole(value.accessRole)) ||
    typeof value.shouldInitializeFromClient !== "boolean" ||
    typeof value.version !== "number" ||
    typeof value.workbookId !== "string" ||
    !(value.update === null || typeof value.update === "string") ||
    !Array.isArray(value.pendingUpdates)
  ) {
    return null;
  }

  const peers = parseCollaborators(value.peers, localDeviceId);
  if (!peers) {
    return null;
  }

  const pendingUpdates = value.pendingUpdates.flatMap((pendingUpdate) => {
    if (typeof pendingUpdate !== "string") {
      return [];
    }

    return [decodeBase64ToBinary(pendingUpdate)];
  });

  if (pendingUpdates.length !== value.pendingUpdates.length) {
    return null;
  }

  return {
    accessRole: value.accessRole,
    peers,
    pendingUpdates,
    shouldInitializeFromClient: value.shouldInitializeFromClient,
    update:
      typeof value.update === "string"
        ? decodeBase64ToBinary(value.update)
        : null,
    version: value.version,
    workbookId: value.workbookId,
  };
}

function parseSyncPayload(
  value: unknown
): { update: Uint8Array; version: number } | null {
  if (
    !isRecord(value) ||
    typeof value.update !== "string" ||
    typeof value.version !== "number"
  ) {
    return null;
  }

  return {
    update: decodeBase64ToBinary(value.update),
    version: value.version,
  };
}

function parseVersionAck(value: unknown): number | null {
  if (!isRecord(value) || typeof value.version !== "number") {
    return null;
  }

  return value.version;
}

function parseSnapshotAck(
  value: unknown
): WorkbookRealtimeSnapshotResult | null {
  if (
    !isRecord(value) ||
    typeof value.lastSyncedAt !== "string" ||
    typeof value.version !== "number"
  ) {
    return null;
  }

  return {
    lastSyncedAt: value.lastSyncedAt,
    version: value.version,
  };
}

function notifyStatus(
  callbacks: WorkbookRealtimeCallbacks | undefined,
  status: CollaborationStatus
): void {
  callbacks?.onStatusChange?.(status);
}

function reportError(
  callbacks: WorkbookRealtimeCallbacks | undefined,
  error: Error
): void {
  callbacks?.onError?.(error);
}

function pushRealtimeEvent<TResponse>(
  channel: Channel,
  eventName: string,
  payload: Record<string, unknown>,
  parseResponse: (response: unknown) => TResponse | null
): Promise<TResponse> {
  return new Promise<TResponse>((resolve, reject) => {
    channel
      .push(eventName, payload, PHOENIX_CHANNEL_TIMEOUT_MS)
      .receive("ok", (response: unknown) => {
        const parsedResponse = parseResponse(response);
        if (parsedResponse === null) {
          reject(
            new Error(`Realtime request "${eventName}" returned invalid data.`)
          );
          return;
        }

        resolve(parsedResponse);
      })
      .receive("error", (response: unknown) => {
        reject(normalizeChannelError(eventName, response));
      })
      .receive("timeout", () => {
        reject(new Error(`Realtime request "${eventName}" timed out.`));
      });
  });
}

export async function connectWorkbookRealtimeChannel(
  uid: string | null,
  workbookId: string,
  requestedAccessRole: CollaborationAccessRole | null = null,
  callbacks?: WorkbookRealtimeCallbacks
): Promise<WorkbookRealtimeChannelConnection> {
  realtimeLogger.info("Starting realtime channel connection...", {
    uid,
    workbookId,
    requestedAccessRole,
    isGuest: uid === null,
  });

  const socketConnection = await ensurePhoenixSocketConnection(uid);
  const { deviceId, socket } = socketConnection;

  realtimeLogger.info("Socket connection established, creating channel...", {
    deviceId,
    workbookId,
  });

  const channel = socket.channel(`workbook:${workbookId}`, {
    requestedAccessRole,
  });

  realtimeLogger.info("Channel created, setting up handlers...", {
    workbookId,
  });

  let isClosedByClient = false;

  channel.on("presence", (payload: unknown) => {
    const peers = parsePresenceResponse(payload, deviceId);
    if (!peers) {
      realtimeLogger.warn(
        "Received invalid realtime presence payload.",
        payload
      );
      return;
    }

    callbacks?.onPresence?.(peers);
  });

  channel.on("sync", (payload: unknown) => {
    const parsedPayload = parseSyncPayload(payload);
    if (!parsedPayload) {
      realtimeLogger.warn("Received invalid realtime sync payload.", payload);
      return;
    }

    callbacks?.onSync?.(parsedPayload);
  });

  channel.on("snapshot", (payload: unknown) => {
    const parsedPayload = parseSyncPayload(payload);
    if (!parsedPayload) {
      realtimeLogger.warn(
        "Received invalid realtime snapshot payload.",
        payload
      );
      return;
    }

    callbacks?.onSnapshot?.(parsedPayload);
  });

  channel.onError((reason: unknown) => {
    if (isClosedByClient) {
      return;
    }

    notifyStatus(callbacks, "disconnected");
    reportError(callbacks, normalizeChannelError("channel_error", reason));
  });

  channel.onClose(() => {
    if (isClosedByClient) {
      return;
    }

    notifyStatus(callbacks, "disconnected");
  });

  notifyStatus(callbacks, "connecting");
  realtimeLogger.info("Joining channel...", { workbookId });

  const initialState = await new Promise<WorkbookRealtimeJoinResponse>(
    (resolve, reject) => {
      channel
        .join(PHOENIX_CHANNEL_TIMEOUT_MS)
        .receive("ok", (response: unknown) => {
          realtimeLogger.info("Channel join successful", { workbookId });
          const parsedResponse = parseJoinResponse(response, deviceId);
          if (!parsedResponse) {
            reject(new Error("Realtime join returned an invalid payload."));
            return;
          }

          resolve(parsedResponse);
        })
        .receive("error", (response: unknown) => {
          realtimeLogger.error("Channel join error", { response, workbookId });
          reject(normalizeChannelError("join", response));
        })
        .receive("timeout", () => {
          realtimeLogger.error("Channel join timeout", { workbookId });
          reject(new Error("Timed out connecting to the workbook channel."));
        });
    }
  ).catch((error) => {
    realtimeLogger.error("Channel join failed", { error, workbookId });
    isClosedByClient = true;
    channel.leave();
    throw error;
  });

  realtimeLogger.info("Joined the workbook realtime channel.", {
    grantedAccessRole: initialState.accessRole,
    isGuest: uid === null,
    requestedAccessRole,
    uid,
    workbookId,
  });

  notifyStatus(callbacks, "connected");
  callbacks?.onPresence?.(initialState.peers);

  return {
    accessRole: initialState.accessRole,
    deviceId,
    disconnect: () => {
      isClosedByClient = true;
      notifyStatus(callbacks, "disconnected");
      channel.leave();
    },
    initialState,
    sendPresence: async (payload) => {
      const peers = await pushRealtimeEvent(
        channel,
        "presence:push",
        payload,
        (response) => parsePresenceResponse(response, deviceId)
      );

      callbacks?.onPresence?.(peers);
      return peers;
    },
    sendSnapshot: async (payload, clientId) => {
      return await pushRealtimeEvent(
        channel,
        "snapshot:push",
        {
          clientId,
          workbook: {
            activeSheetId: payload.activeSheetId,
            collaborationVersion: payload.collaborationVersion,
            meta: payload.meta,
            updateBase64: encodeBinaryToBase64(payload.update),
            version: payload.version,
          },
        },
        parseSnapshotAck
      );
    },
    sendSync: async (update) => {
      return await pushRealtimeEvent(
        channel,
        "sync:push",
        {
          update: encodeBinaryToBase64(update),
        },
        parseVersionAck
      );
    },
    sendTyping: async (payload) => {
      const peers = await pushRealtimeEvent(
        channel,
        "typing:push",
        payload,
        (response) => parsePresenceResponse(response, deviceId)
      );

      callbacks?.onPresence?.(peers);
      return peers;
    },
  };
}
