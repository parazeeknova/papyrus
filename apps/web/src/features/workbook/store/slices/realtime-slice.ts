"use client";

import type { StateCreator } from "zustand";
import type { WorkbookStoreState } from "../workbook-store-types";

type RealtimeSliceState = Pick<
  WorkbookStoreState,
  | "collaborationAccessRole"
  | "collaborationErrorMessage"
  | "collaborationPeers"
  | "collaborationStatus"
>;

export const createRealtimeSlice = (): StateCreator<
  WorkbookStoreState,
  [],
  [],
  RealtimeSliceState
> => {
  return () => ({
    collaborationAccessRole: null,
    collaborationErrorMessage: null,
    collaborationPeers: [],
    collaborationStatus: "disconnected",
  });
};
