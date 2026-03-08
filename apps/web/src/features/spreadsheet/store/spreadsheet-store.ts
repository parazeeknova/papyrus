"use client";

import { create } from "zustand";
import { createEditingSlice } from "./slices/editing-slice";
import { createRealtimeSlice } from "./slices/realtime-slice";
import { createWorkbookSlice } from "./slices/workbook-slice";
import { createSpreadsheetStoreController } from "./spreadsheet-store-controller";
import type { SpreadsheetStoreState } from "./spreadsheet-store-types";

export const useSpreadsheetStore = create<SpreadsheetStoreState>()(
  (set, get, api) => {
    const controller = createSpreadsheetStoreController(set, get);

    return {
      ...createRealtimeSlice(controller)(set, get, api),
      ...createWorkbookSlice(controller)(set, get, api),
      ...createEditingSlice(controller)(set, get, api),
    };
  }
);
