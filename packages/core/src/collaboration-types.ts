export type CollaborationAccessRole = "editor" | "viewer";

export interface CollaboratorIdentity {
  clientId: string;
  color: string;
  icon: string;
  isAnonymous: boolean;
  name: string;
  photoURL: string | null;
}

export interface CollaboratorPresence {
  accessRole: CollaborationAccessRole;
  activeCell: { col: number; row: number } | null;
  identity: CollaboratorIdentity;
  updatedAt: number;
}

export type CollaborationClientMessage =
  | {
      type: "presence";
      payload: {
        activeCell: { col: number; row: number } | null;
      };
    }
  | {
      type: "sync";
      payload: {
        update: string;
      };
    };

export type CollaborationServerMessage =
  | {
      type: "presence";
      payload: {
        peers: CollaboratorPresence[];
      };
    }
  | {
      type: "snapshot";
      payload: {
        peers: CollaboratorPresence[];
        update: string;
      };
    }
  | {
      type: "sync";
      payload: {
        update: string;
      };
    };
