"use client";

import { create } from "zustand";
import { createEditingSlice } from "./slices/editing-slice";
import { createRealtimeSlice } from "./slices/realtime-slice";
import { createWorkbookSlice } from "./slices/workbook-slice";
import { createWorkbookStoreController } from "./workbook-store-controller";
import type { WorkbookStoreState } from "./workbook-store-types";

export const useWorkbookStore = create<WorkbookStoreState>()(
  (set, get, api) => {
    const instrumentedSet: typeof set = (partial, replace) => {
      return set(partial, replace as never);
    };

    const controller = createWorkbookStoreController(instrumentedSet, get);

    return {
      ...createRealtimeSlice(controller)(instrumentedSet, get, api),
      ...createWorkbookSlice(controller)(instrumentedSet, get, api),
      ...createEditingSlice(controller)(set, get, api),
    };
  }
);
