"use client";

import { create } from "zustand";
import { createEditingSlice } from "./slices/editing-slice";
import { createRealtimeSlice } from "./slices/realtime-slice";
import { createWorkbookSlice } from "./slices/workbook-slice";
import { createWorkbookStoreController } from "./workbook-store-controller";
import type { WorkbookStoreState } from "./workbook-store-types";

export const useWorkbookStore = create<WorkbookStoreState>()(
  (set, get, api) => {
    const controller = createWorkbookStoreController(set, get);

    return {
      ...createRealtimeSlice()(set, get, api),
      ...createWorkbookSlice(controller)(set, get, api),
      ...createEditingSlice(controller)(set, get, api),
    };
  }
);
