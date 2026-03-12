"use client";

import { deleteWorkbookPersistence } from "@papyrus/core/workbook-persistence";
import {
  deleteWorkbookRegistryEntry,
  listWorkbookRegistryEntries,
} from "@papyrus/core/workbook-registry";
import { Doc } from "yjs";
import type { StateCreator } from "zustand";
import { cloudWorkbookStore } from "@/web/features/spreadsheet/lib/cloud-workbook-store";
import type { SpreadsheetStoreController } from "../spreadsheet-store-controller";
import type { SpreadsheetStoreState } from "../spreadsheet-store-types";

const MANUAL_SYNC_COOLDOWN_MS = 5000;

type WorkbookSliceState = Pick<
  SpreadsheetStoreState,
  | "activeWorkbook"
  | "createWorkbook"
  | "deleteWorkbook"
  | "exportActiveSheetToCsv"
  | "exportWorkbookToExcel"
  | "hydrateWorkbookList"
  | "hydrationState"
  | "importErrorMessage"
  | "importFileName"
  | "importPhase"
  | "importActiveSheetFromCsv"
  | "importWorkbookFromExcel"
  | "isRemoteSyncAuthenticated"
  | "lastSyncErrorMessage"
  | "lastSyncedAt"
  | "manualSyncCooldownUntil"
  | "openWorkbook"
  | "remoteSyncStatus"
  | "remoteVersion"
  | "saveState"
  | "syncNow"
  | "workbooks"
>;

const sortWorkbooks = (workbooks: SpreadsheetStoreState["workbooks"]) => {
  return workbooks.toSorted((left, right) =>
    right.lastOpenedAt.localeCompare(left.lastOpenedAt)
  );
};

export const createWorkbookSlice = (
  controller: SpreadsheetStoreController
): StateCreator<SpreadsheetStoreState, [], [], WorkbookSliceState> => {
  controller.initializeAuthSync();

  return (_set, get) => ({
    activeWorkbook: null,
    createWorkbook: async () => {
      const { createWorkbookId } = await import("@papyrus/core/workbook-doc");
      const nextWorkbookId = createWorkbookId();
      await controller.activateWorkbook(nextWorkbookId);
    },
    deleteWorkbook: async () => {
      if (controller.isViewerAccess()) {
        return;
      }

      const workbookId = get().activeWorkbook?.id;
      if (!workbookId) {
        return;
      }

      _set({ hydrationState: "loading", saveState: "saving" });

      try {
        const currentAuthenticatedUser =
          controller.getCurrentAuthenticatedUser();
        if (currentAuthenticatedUser) {
          await cloudWorkbookStore.deleteWorkbook(
            currentAuthenticatedUser.uid,
            workbookId
          );
          await cloudWorkbookStore.deleteSharingAccess(workbookId);
        }

        await controller.closeActiveWorkbookSession();
        await deleteWorkbookPersistence(workbookId, new Doc());
        await deleteWorkbookRegistryEntry(workbookId);

        const workbooks = sortWorkbooks(await listWorkbookRegistryEntries());
        _set({ workbooks });

        const [nextWorkbook] = workbooks;
        if (nextWorkbook) {
          await controller.activateWorkbook(nextWorkbook.id, nextWorkbook.name);
          return;
        }

        _set({
          activeSheetCells: {},
          activeSheetColumns: [],
          activeSheetFormats: {},
          activeSheetId: null,
          activeSheetRowHeights: {},
          activeWorkbook: null,
          canRedo: false,
          canUndo: false,
          hydrationState: "ready",
          lastSyncErrorMessage: null,
          lastSyncedAt: null,
          remoteSyncStatus: "idle",
          remoteVersion: null,
          saveState: "saved",
          sheets: [],
          workerResetKey: "initial",
        });
      } catch {
        _set({ hydrationState: "error", saveState: "error" });
      }
    },
    exportActiveSheetToCsv: async () => {
      await controller.exportActiveSheetToCsv();
    },
    exportWorkbookToExcel: async () => {
      await controller.exportWorkbookToExcel();
    },
    hydrateWorkbookList: async () => {
      if (get().hydrationState !== "idle") {
        return;
      }

      _set({ hydrationState: "loading" });

      try {
        const workbooks = sortWorkbooks(await listWorkbookRegistryEntries());
        _set({ workbooks });

        if (workbooks.length === 0) {
          await get().createWorkbook();
          return;
        }

        const [lastOpenedWorkbook] = workbooks;
        if (!lastOpenedWorkbook) {
          _set({ hydrationState: "error", saveState: "error" });
          return;
        }

        await controller.activateWorkbook(
          lastOpenedWorkbook.id,
          lastOpenedWorkbook.name
        );
      } catch {
        _set({ hydrationState: "error", saveState: "error" });
      }
    },
    hydrationState: "idle",
    importErrorMessage: null,
    importFileName: null,
    importPhase: "idle",
    importActiveSheetFromCsv: async (file) => {
      if (controller.isViewerAccess()) {
        return;
      }

      _set({ saveState: "saving" });
      try {
        await controller.importActiveSheetFromCsv(file);
      } catch {
        return;
      }
    },
    importWorkbookFromExcel: async (file) => {
      if (controller.isViewerAccess()) {
        return;
      }

      _set({ saveState: "saving" });
      try {
        await controller.importWorkbookFromExcel(file);
      } catch {
        return;
      }
    },
    isRemoteSyncAuthenticated: false,
    lastSyncErrorMessage: null,
    lastSyncedAt: null,
    manualSyncCooldownUntil: 0,
    openWorkbook: async (workbookId, name, isSharedSession) => {
      await controller.activateWorkbook(workbookId, name, isSharedSession);
    },
    remoteSyncStatus: "disabled",
    remoteVersion: null,
    saveState: "saved",
    syncNow: async () => {
      const activeWorkbookSession = controller.getActiveWorkbookSession();
      const currentAuthenticatedUser = controller.getCurrentAuthenticatedUser();
      if (!(currentAuthenticatedUser && activeWorkbookSession)) {
        return false;
      }

      if (!activeWorkbookSession.dirty) {
        return false;
      }

      const now = Date.now();
      if (now < get().manualSyncCooldownUntil) {
        return false;
      }

      _set({
        manualSyncCooldownUntil: now + MANUAL_SYNC_COOLDOWN_MS,
        saveState: "saving",
      });

      try {
        await controller.flushActiveRemoteWorkbookSync();
        return true;
      } catch (error) {
        _set({
          lastSyncErrorMessage:
            error instanceof Error ? error.message : String(error),
          remoteSyncStatus: "error",
          saveState: "error",
        });
        return false;
      }
    },
    workbooks: [],
  });
};
