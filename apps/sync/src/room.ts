import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { applyUpdate, Doc, encodeStateAsUpdate } from "yjs";
import { readSharedWorkbookAccess } from "./access";
import { log } from "./config";
import { broadcastPresence } from "./protocol";
import type { RoomState } from "./types";

const rooms = new Map<string, RoomState>();
const ROOM_CACHE_DIR = resolve(process.cwd(), ".papyrus-sync-cache");
const ROOM_PERSIST_DEBOUNCE_MS = 200;
const ROOM_POLICY_REFRESH_MS = 5000;
const ROOM_PERSISTENCE_ORIGIN = "room-persistence";

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
  log.debug("hydrated room from disk", workbookId);
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

export function getRoom(workbookId: string): RoomState {
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
  doc.on("update", (_update: Uint8Array, origin: unknown) => {
    if (origin === ROOM_PERSISTENCE_ORIGIN) {
      return;
    }

    scheduleRoomPersist(workbookId, nextRoom);
  });
  rooms.set(workbookId, nextRoom);

  log.debug("created room", workbookId);
  return nextRoom;
}

export function findRoom(workbookId: string): RoomState | undefined {
  return rooms.get(workbookId);
}

export function disposeRoom(workbookId: string, room: RoomState): void {
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

  log.debug("disposed room", workbookId);
}

export { ensureRoomPolicyRefresh };
