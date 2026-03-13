import { expect, mock, test } from "bun:test";

const initializeAuthSync = mock(() => undefined);
const controller = {
  initializeAuthSync,
};
const createWorkbookStoreController = mock(() => controller);
const createEditingSlice = mock(() => () => ({ editingReady: true }));
const createRealtimeSlice = mock(() => () => ({ realtimeReady: true }));
const createWorkbookSlice = mock(() => () => ({ workbookReady: true }));

mock.module("./workbook-store-controller", () => ({
  createWorkbookStoreController,
}));

mock.module("./slices/editing-slice", () => ({
  createEditingSlice,
}));

mock.module("./slices/realtime-slice", () => ({
  createRealtimeSlice,
}));

mock.module("./slices/workbook-slice", () => ({
  createWorkbookSlice,
}));

const { useWorkbookStore } = await import(`./workbook-store.ts?${Date.now()}`);

test("builds the zustand store from the three domain slices", () => {
  const state = useWorkbookStore.getState() as Record<string, unknown>;

  expect(createWorkbookStoreController).toHaveBeenCalledTimes(1);
  expect(createRealtimeSlice).toHaveBeenCalledWith(controller);
  expect(createWorkbookSlice).toHaveBeenCalledWith(controller);
  expect(createEditingSlice).toHaveBeenCalledWith(controller);
  expect(state).toMatchObject({
    editingReady: true,
    realtimeReady: true,
    workbookReady: true,
  });
});
