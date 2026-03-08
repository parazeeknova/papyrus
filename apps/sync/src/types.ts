import type {
  CollaborationAccessRole,
  CollaborationServerMessage,
  CollaboratorPresence,
} from "@papyrus/core/collaboration-types";
import type { Doc } from "yjs";

export interface RoomPeer {
  accessRole: CollaborationAccessRole;
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
    raw: unknown;
    send: (data: CollaborationServerMessage) => unknown;
  };
}

export interface RoomState {
  doc: Doc;
  peers: Map<string, RoomPeer>;
  persistTimeout: ReturnType<typeof setTimeout> | null;
  policyRefreshInFlight: boolean;
  policyRefreshInterval: ReturnType<typeof setInterval> | null;
}

export interface SharedWorkbookAccess {
  accessRole: CollaborationAccessRole;
  ownerId: string;
  sharingEnabled: boolean;
  workbookId: string;
}
