"use client";

import type { CollaborationClientMessage } from "@papyrus/core/collaboration-types";
import type { StateCreator } from "zustand";
import type { SpreadsheetStoreController } from "../spreadsheet-store-controller";
import type { SpreadsheetStoreState } from "../spreadsheet-store-types";

type RealtimeSliceState = Pick<
  SpreadsheetStoreState,
  | "collaborationAccessRole"
  | "collaborationErrorMessage"
  | "collaborationPeers"
  | "collaborationStatus"
  | "connectRealtime"
  | "stopRealtime"
  | "updateRealtimePresence"
  | "updateRealtimeTyping"
>;

export const createRealtimeSlice = (
  controller: SpreadsheetStoreController
): StateCreator<SpreadsheetStoreState, [], [], RealtimeSliceState> => {
  return () => ({
    collaborationAccessRole: null,
    collaborationErrorMessage: null,
    collaborationPeers: [],
    collaborationStatus: "disconnected",
    connectRealtime: (accessRole, identity, serverUrl, isSharedSession) => {
      controller.setRealtimeConnection(
        accessRole,
        identity,
        serverUrl,
        isSharedSession
      );
    },
    stopRealtime: () => {
      controller.stopRealtime();
    },
    updateRealtimePresence: (activeCell) => {
      controller.sendRealtimeMessage({
        payload: {
          activeCell,
        },
        type: "presence",
      } satisfies CollaborationClientMessage);
    },
    updateRealtimeTyping: (typing) => {
      controller.sendRealtimeMessage({
        payload: typing,
        type: "typing",
      } satisfies CollaborationClientMessage);
    },
  });
};
