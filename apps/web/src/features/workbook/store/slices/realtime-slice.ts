"use client";

import type { StateCreator } from "zustand";
import type { WorkbookStoreController } from "../workbook-store-controller";
import type { WorkbookStoreState } from "../workbook-store-types";

type RealtimeSliceState = Pick<
  WorkbookStoreState,
  | "collaborationAccessRole"
  | "collaborationErrorMessage"
  | "collaborationPeers"
  | "collaborationStatus"
  | "publishCollaborationPresence"
  | "publishCollaborationTyping"
>;

export const createRealtimeSlice = (
  controller: WorkbookStoreController
): StateCreator<WorkbookStoreState, [], [], RealtimeSliceState> => {
  return () => ({
    collaborationAccessRole: null,
    collaborationErrorMessage: null,
    collaborationPeers: [],
    collaborationStatus: "disconnected",
    publishCollaborationPresence: controller.publishCollaborationPresence,
    publishCollaborationTyping: controller.publishCollaborationTyping,
  });
};
