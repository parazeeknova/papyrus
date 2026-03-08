import type {
  CollaborationClientMessage,
  CollaborationServerMessage,
  CollaboratorPresence,
} from "@papyrus/core/collaboration-types";
import type { RoomState } from "./types";

export function encodeUpdate(update: Uint8Array): string {
  return Buffer.from(update).toString("base64");
}

export function decodeUpdate(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function isCellPosition(value: unknown): value is { col: number; row: number } {
  if (!(typeof value === "object" && value !== null)) {
    return false;
  }

  const candidate = value as { col?: unknown; row?: unknown };
  return typeof candidate.col === "number" && typeof candidate.row === "number";
}

export function parseClientMessage(
  rawMessage: string | Buffer | Uint8Array
): CollaborationClientMessage | null {
  const text =
    typeof rawMessage === "string"
      ? rawMessage
      : Buffer.from(rawMessage).toString();

  try {
    const payload = JSON.parse(text) as Record<string, unknown>;

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

export function getRoomPresence(room: RoomState): CollaboratorPresence[] {
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

export function broadcastPresence(room: RoomState): void {
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

export function broadcastSync(
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
