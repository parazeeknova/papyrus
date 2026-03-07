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
  typing: {
    cell: { col: number; row: number };
    draft: string;
    sheetId: string;
  } | null;
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
      type: "typing";
      payload: {
        cell: { col: number; row: number } | null;
        draft: string | null;
        sheetId: string | null;
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
        shouldInitializeFromClient: boolean;
        update: string;
      };
    }
  | {
      type: "sync";
      payload: {
        update: string;
      };
    };
