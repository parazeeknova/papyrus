import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  CollaborationServerMessage,
  CollaboratorPresence,
} from "@papyrus/core/collaboration-types";
import { Elysia, t } from "elysia";
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

const accessRoleSchema = t.Union([t.Literal("editor"), t.Literal("viewer")]);

const collaborationMessageSchema = t.Union([
  t.Object({
    type: t.Literal("presence"),
    payload: t.Object({
      activeCell: t.Nullable(
        t.Object({
          col: t.Number(),
          row: t.Number(),
        })
      ),
    }),
  }),
  t.Object({
    type: t.Literal("typing"),
    payload: t.Object({
      cell: t.Nullable(
        t.Object({
          col: t.Number(),
          row: t.Number(),
        })
      ),
      draft: t.Nullable(t.String()),
      sheetId: t.Nullable(t.String()),
    }),
  }),
  t.Object({
    type: t.Literal("sync"),
    payload: t.Object({
      update: t.String(),
    }),
  }),
]);

const collaborationResponseSchema = t.Union([
  t.Object({
    type: t.Literal("presence"),
    payload: t.Object({
      peers: t.Array(
        t.Object({
          accessRole: accessRoleSchema,
          activeCell: t.Nullable(
            t.Object({
              col: t.Number(),
              row: t.Number(),
            })
          ),
          identity: t.Object({
            clientId: t.String(),
            color: t.String(),
            icon: t.String(),
            isAnonymous: t.Boolean(),
            name: t.String(),
            photoURL: t.Nullable(t.String()),
          }),
          typing: t.Nullable(
            t.Object({
              cell: t.Object({
                col: t.Number(),
                row: t.Number(),
              }),
              draft: t.String(),
              sheetId: t.String(),
            })
          ),
          updatedAt: t.Number(),
        })
      ),
    }),
  }),
  t.Object({
    type: t.Literal("snapshot"),
    payload: t.Object({
      peers: t.Array(
        t.Object({
          accessRole: accessRoleSchema,
          activeCell: t.Nullable(
            t.Object({
              col: t.Number(),
              row: t.Number(),
            })
          ),
          identity: t.Object({
            clientId: t.String(),
            color: t.String(),
            icon: t.String(),
            isAnonymous: t.Boolean(),
            name: t.String(),
            photoURL: t.Nullable(t.String()),
          }),
          typing: t.Nullable(
            t.Object({
              cell: t.Object({
                col: t.Number(),
                row: t.Number(),
              }),
              draft: t.String(),
              sheetId: t.String(),
            })
          ),
          updatedAt: t.Number(),
        })
      ),
      shouldInitializeFromClient: t.Boolean(),
      update: t.String(),
    }),
  }),
  t.Object({
    type: t.Literal("sync"),
    payload: t.Object({
      update: t.String(),
    }),
  }),
]);

export const app = new Elysia()
  .get("/", () => ({ status: "ok" }))
  .ws("/collab/:workbookId", {
    body: collaborationMessageSchema,
    params: t.Object({
      workbookId: t.String(),
    }),
    query: t.Object({
      accessRole: accessRoleSchema,
      authToken: t.Optional(t.String()),
      clientId: t.String(),
      color: t.String(),
      icon: t.String(),
      isAnonymous: t.Union([t.Literal("true"), t.Literal("false")]),
      name: t.String(),
      photoURL: t.Optional(t.String()),
    }),
    response: collaborationResponseSchema,
    async open(ws) {
      const {
        params: { workbookId },
        query,
      } = ws.data;
      let resolvedAccessRole: CollaboratorPresence["accessRole"];
      let isOwner = false;

      try {
        const accessResolution = await resolveAccessRole(
          workbookId,
          query.authToken
        );
        resolvedAccessRole = accessResolution.accessRole;
        isOwner = accessResolution.isOwner;
      } catch (error) {
        ws.close(
          4403,
          error instanceof Error ? error.message : "sharing-disabled"
        );
        return;
      }

      const room = getRoom(workbookId);
      const shouldInitializeFromClient = isOwner;
      ensureRoomPolicyRefresh(workbookId, room);

      const peer: RoomPeer = {
        accessRole: resolvedAccessRole,
        activeCell: null,
        clientId: query.clientId,
        color: query.color,
        icon: query.icon,
        isOwner,
        isAnonymous: query.isAnonymous === "true",
        name: query.name,
        photoURL: query.photoURL ?? null,
        typing: null,
        updatedAt: Date.now(),
        ws,
      };

      room.peers.set(peer.clientId, peer);
      ws.send({
        type: "snapshot",
        payload: {
          peers: getRoomPresence(room),
          shouldInitializeFromClient,
          update: encodeUpdate(encodeStateAsUpdate(room.doc)),
        },
      });
      broadcastPresence(room);
    },
    message(ws, message) {
      const {
        params: { workbookId },
        query: { clientId },
      } = ws.data;
      const room = getRoom(workbookId);
      const peer = room.peers.get(clientId);
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
          message.payload.cell &&
          message.payload.draft &&
          message.payload.sheetId
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

      applyUpdate(room.doc, decodeUpdate(message.payload.update), clientId);
      broadcastSync(room, message.payload.update, clientId);
    },
    close(ws) {
      const {
        params: { workbookId },
        query: { clientId },
      } = ws.data;
      const room = getRoom(workbookId);

      room.peers.delete(clientId);
      broadcastPresence(room);
      if (room.peers.size === 0) {
        disposeRoom(workbookId, room);
      }
    },
  })
  .listen(3001);

export type SyncApp = typeof app;

console.log(
  `Sync server running at ${app.server?.hostname}:${app.server?.port}`
);
