import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  CollaborationClientMessage,
  CollaborationServerMessage,
  CollaboratorPresence,
} from "@papyrus/core/collaboration-types";
import { type ServerWebSocket, serve } from "bun";
import { applyUpdate, Doc, encodeStateAsUpdate } from "yjs";

interface RoomPeer {
  accessRole: CollaboratorPresence["accessRole"];
  activeCell: CollaboratorPresence["activeCell"];
  clientId: string;
  color: string;
  icon: string;
  isAnonymous: boolean;
  isOwner: boolean;
  name: string;
  photoURL: string | null;
  typing: CollaboratorPresence["typing"];
  updatedAt: number;
  ws: {
    close: (code?: number, reason?: string) => unknown;
    send: (data: CollaborationServerMessage) => unknown;
  };
}

interface RoomState {
  doc: Doc;
  peers: Map<string, RoomPeer>;
  persistTimeout: ReturnType<typeof setTimeout> | null;
  policyRefreshInFlight: boolean;
  policyRefreshInterval: ReturnType<typeof setInterval> | null;
}

interface SharedWorkbookAccess {
  accessRole: CollaboratorPresence["accessRole"];
  ownerId: string;
  sharingEnabled: boolean;
  workbookId: string;
}

const rooms = new Map<string, RoomState>();
const ROOM_CACHE_DIR = resolve(process.cwd(), ".papyrus-sync-cache");
const ROOM_PERSIST_DEBOUNCE_MS = 200;
const ROOM_POLICY_REFRESH_MS = 5000;
const ROOM_PERSISTENCE_ORIGIN = "room-persistence";
const DOT_ENV_LINE_SPLIT_PATTERN = /\r?\n/;
const WEB_APP_DIR = resolve(process.cwd(), "..", "web");

function parseDotEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  const contents = readFileSync(filePath, "utf8");
  const entries = contents.split(DOT_ENV_LINE_SPLIT_PATTERN);
  const result: Record<string, string> = {};

  for (const entry of entries) {
    const trimmedEntry = entry.trim();
    if (!trimmedEntry || trimmedEntry.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedEntry.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmedEntry.slice(0, separatorIndex).trim();
    const rawValue = trimmedEntry.slice(separatorIndex + 1).trim();
    const quotedValue =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"));

    result[key] = quotedValue ? rawValue.slice(1, -1) : rawValue;
  }

  return result;
}

function readFallbackEnvValue(key: string): string | undefined {
  const candidateFiles = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), ".env"),
    resolve(WEB_APP_DIR, ".env.local"),
    resolve(WEB_APP_DIR, ".env"),
  ];

  for (const filePath of candidateFiles) {
    const value = parseDotEnvFile(filePath)[key];
    if (value) {
      return value;
    }
  }

  return undefined;
}

function getConfigValue(...keys: string[]): string | undefined {
  for (const key of keys) {
    const processValue = process.env[key];
    if (processValue) {
      return processValue;
    }

    const fallbackValue = readFallbackEnvValue(key);
    if (fallbackValue) {
      return fallbackValue;
    }
  }

  return undefined;
}

const FIREBASE_API_KEY = getConfigValue(
  "FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_API_KEY"
);
const FIREBASE_PROJECT_ID = getConfigValue(
  "FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
);

function encodeUpdate(update: Uint8Array): string {
  return Buffer.from(update).toString("base64");
}

function decodeUpdate(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function getRoom(workbookId: string): RoomState {
  const existingRoom = rooms.get(workbookId);
  if (existingRoom) {
    return existingRoom;
  }

  const doc = new Doc();
  const nextRoom: RoomState = {
    doc,
    peers: new Map(),
    policyRefreshInFlight: false,
    policyRefreshInterval: null,
    persistTimeout: null,
  };
  hydrateRoomFromDisk(workbookId, doc);
  doc.on("update", (_update, origin) => {
    if (origin === ROOM_PERSISTENCE_ORIGIN) {
      return;
    }

    scheduleRoomPersist(workbookId, nextRoom);
  });
  rooms.set(workbookId, nextRoom);
  return nextRoom;
}

function getFirestoreDocumentUrl(workbookId: string): string | null {
  if (!(FIREBASE_API_KEY && FIREBASE_PROJECT_ID)) {
    return null;
  }

  return `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/sharedWorkbooks/${encodeURIComponent(workbookId)}?key=${FIREBASE_API_KEY}`;
}

function getStringField(
  fields: Record<string, { stringValue?: string }>,
  key: string
): string | null {
  const value = fields[key];
  return typeof value?.stringValue === "string" ? value.stringValue : null;
}

function getBooleanField(
  fields: Record<string, { booleanValue?: boolean }>,
  key: string
): boolean | null {
  const value = fields[key];
  return typeof value?.booleanValue === "boolean" ? value.booleanValue : null;
}

async function readSharedWorkbookAccess(
  workbookId: string
): Promise<SharedWorkbookAccess | null> {
  const documentUrl = getFirestoreDocumentUrl(workbookId);
  if (!documentUrl) {
    throw new Error("share-config-unavailable");
  }

  const response = await fetch(documentUrl);
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error("share-config-unavailable");
  }

  const payload = (await response.json()) as {
    fields?: Record<string, { booleanValue?: boolean; stringValue?: string }>;
  };
  const fields = payload.fields;
  if (!fields) {
    return null;
  }

  const accessRole = getStringField(fields, "accessRole");
  const ownerId = getStringField(fields, "ownerId");
  const sharingEnabled = getBooleanField(fields, "sharingEnabled");
  const storedWorkbookId = getStringField(fields, "workbookId");
  if (
    (accessRole !== "editor" && accessRole !== "viewer") ||
    !ownerId ||
    sharingEnabled === null ||
    !storedWorkbookId
  ) {
    return null;
  }

  return {
    accessRole,
    ownerId,
    sharingEnabled,
    workbookId: storedWorkbookId,
  };
}

async function verifyOwnerAuthToken(authToken: string): Promise<string | null> {
  if (!FIREBASE_API_KEY) {
    throw new Error("share-config-unavailable");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      body: JSON.stringify({ idToken: authToken }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    }
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    users?: Array<{ localId?: string }>;
  };

  return payload.users?.[0]?.localId ?? null;
}

async function resolveAccessRole(
  workbookId: string,
  authToken?: string
): Promise<{
  accessRole: CollaboratorPresence["accessRole"];
  isOwner: boolean;
}> {
  const sharedWorkbookAccess = await readSharedWorkbookAccess(workbookId);
  if (!sharedWorkbookAccess) {
    throw new Error("missing-share-config");
  }

  if (authToken) {
    const ownerId = await verifyOwnerAuthToken(authToken);
    if (ownerId === sharedWorkbookAccess.ownerId) {
      return {
        accessRole: "editor",
        isOwner: true,
      };
    }
  }

  if (!sharedWorkbookAccess.sharingEnabled) {
    throw new Error("sharing-disabled");
  }

  return {
    accessRole: sharedWorkbookAccess.accessRole,
    isOwner: false,
  };
}

async function refreshRoomPolicy(
  workbookId: string,
  room: RoomState
): Promise<void> {
  if (room.policyRefreshInFlight) {
    return;
  }

  room.policyRefreshInFlight = true;

  try {
    const sharedWorkbookAccess = await readSharedWorkbookAccess(workbookId);
    let shouldBroadcastPresence = false;

    for (const peer of room.peers.values()) {
      if (peer.isOwner) {
        if (peer.accessRole !== "editor") {
          peer.accessRole = "editor";
          shouldBroadcastPresence = true;
        }
        continue;
      }

      if (!sharedWorkbookAccess) {
        peer.ws.close(4403, "missing-share-config");
        continue;
      }

      if (!sharedWorkbookAccess.sharingEnabled) {
        peer.ws.close(4403, "sharing-disabled");
        continue;
      }

      if (peer.accessRole !== sharedWorkbookAccess.accessRole) {
        peer.accessRole = sharedWorkbookAccess.accessRole;
        shouldBroadcastPresence = true;
      }
    }

    if (shouldBroadcastPresence) {
      broadcastPresence(room);
    }
  } catch {
    return;
  } finally {
    room.policyRefreshInFlight = false;
  }
}

function ensureRoomPolicyRefresh(workbookId: string, room: RoomState): void {
  if (room.policyRefreshInterval) {
    return;
  }

  room.policyRefreshInterval = setInterval(() => {
    refreshRoomPolicy(workbookId, room).catch(() => undefined);
  }, ROOM_POLICY_REFRESH_MS);
}

function ensureRoomCacheDirectory(): void {
  if (existsSync(ROOM_CACHE_DIR)) {
    return;
  }

  mkdirSync(ROOM_CACHE_DIR, { recursive: true });
}

function getRoomCachePath(workbookId: string): string {
  return join(ROOM_CACHE_DIR, `${encodeURIComponent(workbookId)}.bin`);
}

function hydrateRoomFromDisk(workbookId: string, doc: Doc): void {
  ensureRoomCacheDirectory();
  const cachePath = getRoomCachePath(workbookId);
  if (!existsSync(cachePath)) {
    return;
  }

  const update = readFileSync(cachePath);
  if (update.byteLength === 0) {
    return;
  }

  applyUpdate(doc, new Uint8Array(update), ROOM_PERSISTENCE_ORIGIN);
}

function persistRoom(workbookId: string, room: RoomState): void {
  ensureRoomCacheDirectory();
  writeFileSync(
    getRoomCachePath(workbookId),
    Buffer.from(encodeStateAsUpdate(room.doc))
  );
}

function scheduleRoomPersist(workbookId: string, room: RoomState): void {
  if (room.persistTimeout) {
    clearTimeout(room.persistTimeout);
  }

  room.persistTimeout = setTimeout(() => {
    room.persistTimeout = null;
    persistRoom(workbookId, room);
  }, ROOM_PERSIST_DEBOUNCE_MS);
}

function disposeRoom(workbookId: string, room: RoomState): void {
  if (room.persistTimeout) {
    clearTimeout(room.persistTimeout);
    room.persistTimeout = null;
  }
  if (room.policyRefreshInterval) {
    clearInterval(room.policyRefreshInterval);
    room.policyRefreshInterval = null;
  }

  persistRoom(workbookId, room);
  room.doc.destroy();
  rooms.delete(workbookId);
}

function getRoomPresence(room: RoomState): CollaboratorPresence[] {
  return [...room.peers.values()].map((peer) => ({
    accessRole: peer.accessRole,
    activeCell: peer.activeCell,
    identity: {
      clientId: peer.clientId,
      color: peer.color,
      icon: peer.icon,
      isAnonymous: peer.isAnonymous,
      name: peer.name,
      photoURL: peer.photoURL,
    },
    typing: peer.typing,
    updatedAt: peer.updatedAt,
  }));
}

function broadcastPresence(room: RoomState): void {
  const payload: CollaborationServerMessage = {
    type: "presence",
    payload: {
      peers: getRoomPresence(room),
    },
  };

  for (const peer of room.peers.values()) {
    peer.ws.send(payload);
  }
}

function broadcastSync(
  room: RoomState,
  update: string,
  senderClientId: string
): void {
  const payload: CollaborationServerMessage = {
    type: "sync",
    payload: {
      update,
    },
  };

  for (const peer of room.peers.values()) {
    if (peer.clientId === senderClientId) {
      continue;
    }

    peer.ws.send(payload);
  }
}

type AccessRole = CollaboratorPresence["accessRole"];

interface ParsedUpgradeQuery {
  accessRole: AccessRole;
  authToken?: string;
  clientId: string;
  color: string;
  icon: string;
  isAnonymous: boolean;
  name: string;
  photoURL: string | null;
}

interface AuthorizedSocketData {
  accessRole: AccessRole;
  clientId: string;
  color: string;
  icon: string;
  isAnonymous: boolean;
  isOwner: boolean;
  name: string;
  photoURL: string | null;
  type: "authorized";
  workbookId: string;
}

interface DeniedSocketData {
  reason: string;
  type: "denied";
}

type SocketData = AuthorizedSocketData | DeniedSocketData;

function isAccessRole(value: string | null): value is AccessRole {
  return value === "editor" || value === "viewer";
}

function isCellPosition(value: unknown): value is { col: number; row: number } {
  if (!(typeof value === "object" && value !== null)) {
    return false;
  }

  const candidate = value as { col?: unknown; row?: unknown };
  return typeof candidate.col === "number" && typeof candidate.row === "number";
}

function parseUpgradeQuery(url: URL): ParsedUpgradeQuery | null {
  const accessRole = url.searchParams.get("accessRole");
  const clientId = url.searchParams.get("clientId");
  const color = url.searchParams.get("color");
  const icon = url.searchParams.get("icon");
  const isAnonymous = url.searchParams.get("isAnonymous");
  const name = url.searchParams.get("name");
  const authToken = url.searchParams.get("authToken");
  const photoURL = url.searchParams.get("photoURL");

  if (
    !(
      isAccessRole(accessRole) &&
      clientId &&
      color &&
      icon &&
      (isAnonymous === "true" || isAnonymous === "false") &&
      name
    )
  ) {
    return null;
  }

  return {
    accessRole,
    authToken: authToken || undefined,
    clientId,
    color,
    icon,
    isAnonymous: isAnonymous === "true",
    name,
    photoURL: photoURL || null,
  };
}

function getWorkbookIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith("/collab/")) {
    return null;
  }

  const encodedWorkbookId = pathname.slice("/collab/".length);
  if (!encodedWorkbookId) {
    return null;
  }

  return decodeURIComponent(encodedWorkbookId);
}

function sendSocketMessage(
  ws: ServerWebSocket<SocketData>,
  message: CollaborationServerMessage
): void {
  ws.send(JSON.stringify(message));
}

function parseClientMessage(
  rawMessage: string
): CollaborationClientMessage | null {
  try {
    const payload = JSON.parse(rawMessage) as Record<string, unknown>;

    if (payload.type === "presence") {
      const presencePayload = payload.payload as {
        activeCell?: unknown;
      };
      return presencePayload?.activeCell === null ||
        isCellPosition(presencePayload?.activeCell)
        ? {
            payload: {
              activeCell:
                (presencePayload?.activeCell as {
                  col: number;
                  row: number;
                } | null) ?? null,
            },
            type: "presence",
          }
        : null;
    }

    if (payload.type === "typing") {
      const typingPayload = payload.payload as {
        cell?: unknown;
        draft?: unknown;
        sheetId?: unknown;
      };
      const hasValidCell =
        typingPayload?.cell === null || isCellPosition(typingPayload?.cell);
      const hasValidDraft =
        typingPayload?.draft === null ||
        typeof typingPayload?.draft === "string";
      const hasValidSheetId =
        typingPayload?.sheetId === null ||
        typeof typingPayload?.sheetId === "string";

      return hasValidCell && hasValidDraft && hasValidSheetId
        ? {
            payload: {
              cell:
                (typingPayload?.cell as { col: number; row: number } | null) ??
                null,
              draft: (typingPayload?.draft as string | null) ?? null,
              sheetId: (typingPayload?.sheetId as string | null) ?? null,
            },
            type: "typing",
          }
        : null;
    }

    if (
      payload.type === "sync" &&
      typeof (payload.payload as { update?: unknown })?.update === "string"
    ) {
      return {
        payload: {
          update: (payload.payload as { update: string }).update,
        },
        type: "sync",
      };
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeIncomingMessage(
  message: string | Buffer | Uint8Array
): string {
  return typeof message === "string"
    ? message
    : Buffer.from(message).toString();
}

async function createSocketData(request: Request): Promise<SocketData | null> {
  const url = new URL(request.url);
  const workbookId = getWorkbookIdFromPath(url.pathname);
  const query = parseUpgradeQuery(url);
  if (!(workbookId && query)) {
    return null;
  }

  try {
    const accessResolution = await resolveAccessRole(
      workbookId,
      query.authToken
    );

    return {
      accessRole: accessResolution.accessRole,
      clientId: query.clientId,
      color: query.color,
      icon: query.icon,
      isAnonymous: query.isAnonymous,
      isOwner: accessResolution.isOwner,
      name: query.name,
      photoURL: query.photoURL,
      type: "authorized",
      workbookId,
    };
  } catch (error) {
    return {
      reason: error instanceof Error ? error.message : "sharing-disabled",
      type: "denied",
    };
  }
}

function handleSocketOpen(ws: ServerWebSocket<SocketData>): void {
  if (ws.data.type === "denied") {
    ws.close(4403, ws.data.reason);
    return;
  }

  const room = getRoom(ws.data.workbookId);
  const shouldInitializeFromClient = ws.data.isOwner;
  ensureRoomPolicyRefresh(ws.data.workbookId, room);

  const peer: RoomPeer = {
    accessRole: ws.data.accessRole,
    activeCell: null,
    clientId: ws.data.clientId,
    color: ws.data.color,
    icon: ws.data.icon,
    isAnonymous: ws.data.isAnonymous,
    isOwner: ws.data.isOwner,
    name: ws.data.name,
    photoURL: ws.data.photoURL,
    typing: null,
    updatedAt: Date.now(),
    ws: {
      close: (code, reason) => ws.close(code, reason),
      send: (message) => sendSocketMessage(ws, message),
    },
  };

  room.peers.set(peer.clientId, peer);
  sendSocketMessage(ws, {
    type: "snapshot",
    payload: {
      peers: getRoomPresence(room),
      shouldInitializeFromClient,
      update: encodeUpdate(encodeStateAsUpdate(room.doc)),
    },
  });
  broadcastPresence(room);
}

function handleSocketMessage(
  ws: ServerWebSocket<SocketData>,
  rawMessage: string | Buffer | Uint8Array
): void {
  if (ws.data.type === "denied") {
    return;
  }

  const message = parseClientMessage(normalizeIncomingMessage(rawMessage));
  if (!message) {
    return;
  }

  const room = getRoom(ws.data.workbookId);
  const peer = room.peers.get(ws.data.clientId);
  if (!peer) {
    return;
  }

  if (message.type === "presence") {
    peer.activeCell = message.payload.activeCell;
    peer.updatedAt = Date.now();
    broadcastPresence(room);
    return;
  }

  if (message.type === "typing") {
    peer.typing =
      message.payload.cell && message.payload.draft && message.payload.sheetId
        ? {
            cell: message.payload.cell,
            draft: message.payload.draft,
            sheetId: message.payload.sheetId,
          }
        : null;
    peer.updatedAt = Date.now();
    broadcastPresence(room);
    return;
  }

  if (peer.accessRole === "viewer") {
    return;
  }

  applyUpdate(room.doc, decodeUpdate(message.payload.update), peer.clientId);
  broadcastSync(room, message.payload.update, peer.clientId);
}

function handleSocketClose(ws: ServerWebSocket<SocketData>): void {
  if (ws.data.type === "denied") {
    return;
  }

  const room = getRoom(ws.data.workbookId);
  room.peers.delete(ws.data.clientId);
  broadcastPresence(room);
  if (room.peers.size === 0) {
    disposeRoom(ws.data.workbookId, room);
  }
}

export const server = serve<SocketData>({
  fetch: async (request, serverInstance) => {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return Response.json({ status: "ok" });
    }

    if (!url.pathname.startsWith("/collab/")) {
      return new Response("Not Found", { status: 404 });
    }

    const socketData = await createSocketData(request);
    if (!socketData) {
      return new Response("Invalid collaboration request", { status: 400 });
    }

    const didUpgrade = serverInstance.upgrade(request, {
      data: socketData,
    });
    return didUpgrade
      ? undefined
      : new Response("Failed to upgrade websocket", { status: 500 });
  },
  port: 3001,
  websocket: {
    close: (ws) => {
      handleSocketClose(ws);
    },
    message: (ws, message) => {
      handleSocketMessage(ws, message);
    },
    open: (ws) => {
      handleSocketOpen(ws);
    },
  },
});

console.log(`Sync server running at ${server.hostname}:${server.port}`);
