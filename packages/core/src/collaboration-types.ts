export type CollaborationAccessRole = "editor" | "viewer";
export type CollaboratorSelectionMode = "cells" | "columns" | "rows";

export interface CollaboratorIdentity {
  clientId: string;
  color: string;
  icon: string;
  isAnonymous: boolean;
  name: string;
  photoURL: string | null;
}

export interface CollaboratorSelectionRange {
  end: { col: number; row: number };
  mode: CollaboratorSelectionMode;
  start: { col: number; row: number };
}

export interface CollaboratorPresence {
  accessRole: CollaborationAccessRole;
  activeCell: { col: number; row: number } | null;
  identity: CollaboratorIdentity;
  selection: CollaboratorSelectionRange | null;
  sheetId: string | null;
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
        selection: CollaboratorSelectionRange | null;
        sheetId: string | null;
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
