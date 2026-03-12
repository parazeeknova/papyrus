"use client";

import type { StateCreator } from "zustand";
import type { SpreadsheetStoreState } from "../spreadsheet-store-types";

type RealtimeSliceState = Pick<
  SpreadsheetStoreState,
  | "collaborationAccessRole"
  | "collaborationErrorMessage"
  | "collaborationPeers"
  | "collaborationStatus"
>;

export const createRealtimeSlice = (): StateCreator<
  SpreadsheetStoreState,
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
