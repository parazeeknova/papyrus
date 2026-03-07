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
  name: string;
  photoURL: string | null;
  updatedAt: number;
  ws: {
    send: (data: CollaborationServerMessage) => unknown;
  };
}

interface RoomState {
  doc: Doc;
  peers: Map<string, RoomPeer>;
  persistTimeout: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, RoomState>();
const ROOM_CACHE_DIR = resolve(process.cwd(), ".papyrus-sync-cache");
const ROOM_PERSIST_DEBOUNCE_MS = 200;
const ROOM_PERSISTENCE_ORIGIN = "room-persistence";

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
          updatedAt: t.Number(),
        })
      ),
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
      clientId: t.String(),
      color: t.String(),
      icon: t.String(),
      isAnonymous: t.Union([t.Literal("true"), t.Literal("false")]),
      name: t.String(),
      photoURL: t.Optional(t.String()),
    }),
    response: collaborationResponseSchema,
    open(ws) {
      const {
        params: { workbookId },
        query,
      } = ws.data;
      const room = getRoom(workbookId);

      const peer: RoomPeer = {
        accessRole: query.accessRole,
        activeCell: null,
        clientId: query.clientId,
        color: query.color,
        icon: query.icon,
        isAnonymous: query.isAnonymous === "true",
        name: query.name,
        photoURL: query.photoURL ?? null,
        updatedAt: Date.now(),
        ws,
      };

      room.peers.set(peer.clientId, peer);
      ws.send({
        type: "snapshot",
        payload: {
          peers: getRoomPresence(room),
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
