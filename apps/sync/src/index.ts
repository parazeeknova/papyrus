import type { CollaborationAccessRole } from "@papyrus/core/collaboration-types";
import { Elysia, t } from "elysia";
import { applyUpdate, encodeStateAsUpdate } from "yjs";
import { resolveAccessRole } from "./access";
import { log } from "./config";
import {
  broadcastPresence,
  broadcastSync,
  decodeUpdate,
  encodeUpdate,
  getRoomPresence,
  parseClientMessage,
} from "./protocol";
import {
  disposeRoom,
  ensureRoomPolicyRefresh,
  findRoom,
  getRoom,
} from "./room";
import type { RoomPeer } from "./types";

function isAccessRole(value: string | null): value is CollaborationAccessRole {
  return value === "editor" || value === "viewer";
}

const app = new Elysia()
  .get("/", () => ({ status: "ok" }))
  .ws("/collab/:workbookId", {
    query: t.Object({
      accessRole: t.String(),
      clientId: t.String(),
      color: t.String(),
      icon: t.String(),
      isAnonymous: t.String(),
      name: t.String(),
      authToken: t.Optional(t.String()),
      photoURL: t.Optional(t.String()),
    }),

    async open(ws) {
      const { workbookId } = ws.data.params;
      const query = ws.data.query;

      if (
        !(
          isAccessRole(query.accessRole) &&
          query.clientId &&
          query.color &&
          query.icon &&
          (query.isAnonymous === "true" || query.isAnonymous === "false") &&
          query.name
        )
      ) {
        ws.raw.close(4400, "invalid-query");
        return;
      }

      const decodedWorkbookId = decodeURIComponent(workbookId);

      let accessRole: CollaborationAccessRole;
      let isOwner: boolean;

      try {
        const accessResolution = await resolveAccessRole(
          decodedWorkbookId,
          query.authToken || undefined
        );
        accessRole = accessResolution.accessRole;
        isOwner = accessResolution.isOwner;
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "sharing-disabled";
        ws.raw.close(4403, reason);
        return;
      }

      const room = getRoom(decodedWorkbookId);
      const shouldInitializeFromClient = isOwner && room.peers.size === 0;
      const snapshotUpdate = encodeUpdate(encodeStateAsUpdate(room.doc));
      ensureRoomPolicyRefresh(decodedWorkbookId, room);

      const existingPeer = room.peers.get(query.clientId);
      if (existingPeer && existingPeer.ws.raw !== ws.raw) {
        existingPeer.ws.close(4409, "replaced-client");
      }

      const peer: RoomPeer = {
        accessRole,
        activeCell: null,
        clientId: query.clientId,
        color: query.color,
        icon: query.icon,
        isAnonymous: query.isAnonymous === "true",
        isOwner,
        name: query.name,
        photoURL: query.photoURL || null,
        typing: null,
        updatedAt: Date.now(),
        ws: {
          close: (code, reason) => ws.raw.close(code, reason),
          raw: ws.raw,
          send: (message) => ws.raw.send(JSON.stringify(message)),
        },
      };

      room.peers.set(peer.clientId, peer);

      log.info(
        "peer joined",
        decodedWorkbookId,
        query.clientId,
        `role=${accessRole}`,
        `isOwner=${isOwner}`
      );

      ws.raw.send(
        JSON.stringify({
          type: "snapshot",
          payload: {
            peers: getRoomPresence(room),
            shouldInitializeFromClient,
            update: snapshotUpdate,
          },
        })
      );
      broadcastPresence(room);
    },

    message(ws, rawMessage) {
      const { workbookId } = ws.data.params;
      const { clientId } = ws.data.query;
      const decodedWorkbookId = decodeURIComponent(workbookId);

      const room = findRoom(decodedWorkbookId);
      if (!room) {
        return;
      }

      const peer = room.peers.get(clientId);
      if (!peer || peer.ws.raw !== ws.raw) {
        return;
      }

      const message = parseClientMessage(
        rawMessage as string | Buffer | Uint8Array | Record<string, unknown>
      );
      if (!message) {
        log.warn(
          "message dropped: parse failed",
          clientId,
          typeof rawMessage,
          typeof rawMessage === "object"
            ? JSON.stringify(rawMessage).slice(0, 200)
            : String(rawMessage).slice(0, 200)
        );
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

      applyUpdate(
        room.doc,
        decodeUpdate(message.payload.update),
        peer.clientId
      );
      broadcastSync(room, message.payload.update, peer.clientId);
    },

    close(ws) {
      const { workbookId } = ws.data.params;
      const { clientId } = ws.data.query;
      const decodedWorkbookId = decodeURIComponent(workbookId);

      const room = findRoom(decodedWorkbookId);
      if (!room) {
        return;
      }

      const peer = room.peers.get(clientId);
      if (!peer || peer.ws.raw !== ws.raw) {
        log.debug("stale close ignored", decodedWorkbookId, clientId);
        return;
      }

      room.peers.delete(clientId);
      log.info("peer left", decodedWorkbookId, clientId);

      broadcastPresence(room);
      if (room.peers.size === 0) {
        disposeRoom(decodedWorkbookId, room);
      }
    },
  })
  .listen(3001);

console.log(
  `Sync server running at ${app.server?.hostname}:${app.server?.port}`
);
