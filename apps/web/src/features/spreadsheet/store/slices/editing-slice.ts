"use client";

import type { CollaborationAccessRole } from "@papyrus/core/collaboration-types";
import {
  createSheet,
  getWorkbookMeta,
  renameSheetColumn,
  renameWorkbook as renameWorkbookInDoc,
  replaceSheetCells,
  replaceSheetColumns,
  replaceSheetFormats,
  replaceSheetRowHeights,
  setActiveSheet as setActiveSheetInDoc,
  setSheetCellRaw,
  setSheetCellValues,
  setSheetColumnWidth,
  setSheetFormats,
  setSheetRowHeight,
  setWorkbookFavorite,
  setWorkbookSharingAccessRole,
  setWorkbookSharingEnabled,
  touchWorkbook,
} from "@papyrus/core/workbook-doc";
import { DEFAULT_SHEET_COLUMN_WIDTH } from "@papyrus/core/workbook-types";
import type { StateCreator } from "zustand";
import {
  cellId,
  isValidColumnName,
  normalizeColumnName,
  parseStoredCellId,
  rewriteFormulaColumnName,
  rewriteFormulaReferences,
} from "@/web/features/spreadsheet/lib/spreadsheet-engine";
import type { SpreadsheetStoreController } from "../spreadsheet-store-controller";
import type { SpreadsheetStoreState } from "../spreadsheet-store-types";

type EditingSliceState = Pick<
  SpreadsheetStoreState,
  | "activeSheetCells"
  | "activeSheetColumns"
  | "activeSheetFormats"
  | "activeSheetId"
  | "activeSheetRowHeights"
  | "canRedo"
  | "canUndo"
  | "createSheet"
  | "deleteColumns"
  | "deleteRows"
  | "redo"
  | "renameColumn"
  | "resizeColumn"
  | "resizeRow"
  | "renameWorkbook"
  | "setActiveSheet"
  | "setCellFormats"
  | "setCellValue"
  | "setCellValuesByKey"
  | "setWorkbookFavorite"
  | "setWorkbookSharingAccessRole"
  | "setWorkbookSharingEnabled"
  | "sheets"
  | "undo"
  | "workerResetKey"
>;

const updateSharingState = async (
  controller: SpreadsheetStoreController,
  set: (partial: Partial<SpreadsheetStoreState>) => void,
  updater: () => void,
  rollback: () => void
): Promise<boolean> => {
  updater();

  try {
    await controller.syncActiveWorkbookShareAccess();
    await controller.persistActiveWorkbookMeta();
    return true;
  } catch (error) {
    rollback();
    set({
      collaborationErrorMessage:
        error instanceof Error ? error.message : String(error),
      saveState: "error",
    });
    return false;
  }
};

export const createEditingSlice = (
  controller: SpreadsheetStoreController
): StateCreator<SpreadsheetStoreState, [], [], EditingSliceState> => {
  return (set, get) => ({
    activeSheetCells: {},
    activeSheetColumns: [],
    activeSheetFormats: {},
    activeSheetId: null,
    activeSheetRowHeights: {},
    canRedo: false,
    canUndo: false,
    createSheet: async () => {
      const activeWorkbookSession = controller.getActiveWorkbookSession();
      if (!activeWorkbookSession || controller.isViewerAccess()) {
        return;
      }

      set({ saveState: "saving" });
      const nextSheet = createSheet(activeWorkbookSession.doc);
      setActiveSheetInDoc(activeWorkbookSession.doc, nextSheet.id);
      controller.syncUndoManager(activeWorkbookSession.doc);
      await controller.persistActiveWorkbookMeta();
    },
    deleteColumns: async (startColumn, columnCount) => {
      if (controller.isViewerAccess()) {
        return;
      }

      const activeWorkbookSession = controller.getActiveWorkbookSession();
      const activeSheetId = get().activeSheetId;
      if (!(activeWorkbookSession && activeSheetId)) {
        return;
      }

      const currentSheetColumns = get().activeSheetColumns;
      const currentColumns = controller.buildColumnNames(currentSheetColumns);
      const currentColumnCount = currentSheetColumns.length;
      if (
        columnCount <= 0 ||
        startColumn < 0 ||
        startColumn >= currentColumnCount
      ) {
        return;
      }

      const endColumn = Math.min(currentColumnCount, startColumn + columnCount);
      const removedColumnCount = endColumn - startColumn;
      const remainingColumns = currentSheetColumns.filter(
        (_column, index) => index < startColumn || index >= endColumn
      );
      const nextColumnNames = controller.fillColumnNames(
        remainingColumns.map((column) => column.name),
        currentColumnCount
      );
      const nextColumns = nextColumnNames.map((name, index) => ({
        index,
        name,
        width: remainingColumns[index]?.width ?? DEFAULT_SHEET_COLUMN_WIDTH,
      }));

      const nextCells: Record<string, string> = {};
      const nextFormats: SpreadsheetStoreState["activeSheetFormats"] = {};
      for (const [storedCellKey, cellValue] of Object.entries(
        get().activeSheetCells
      )) {
        const position = parseStoredCellId(storedCellKey);
        if (!position) {
          continue;
        }

        if (position.col >= startColumn && position.col < endColumn) {
          continue;
        }

        const nextCol =
          position.col >= endColumn
            ? position.col - removedColumnCount
            : position.col;
        nextCells[cellId(position.row, nextCol)] = rewriteFormulaReferences(
          cellValue.raw,
          currentColumns,
          nextColumnNames,
          (referencePosition) => {
            if (
              referencePosition.col >= startColumn &&
              referencePosition.col < endColumn
            ) {
              return "deleted";
            }

            if (referencePosition.col >= endColumn) {
              return {
                col: referencePosition.col - removedColumnCount,
                row: referencePosition.row,
              };
            }

            return referencePosition;
          }
        );
      }

      for (const [storedCellKey, cellFormat] of Object.entries(
        get().activeSheetFormats
      )) {
        const position = parseStoredCellId(storedCellKey);
        if (!position) {
          continue;
        }

        if (position.col >= startColumn && position.col < endColumn) {
          continue;
        }

        const nextCol =
          position.col >= endColumn
            ? position.col - removedColumnCount
            : position.col;
        nextFormats[cellId(position.row, nextCol)] = cellFormat;
      }

      set({ saveState: "saving" });
      replaceSheetColumns(
        activeWorkbookSession.doc,
        activeSheetId,
        nextColumns
      );
      replaceSheetCells(activeWorkbookSession.doc, activeSheetId, nextCells);
      replaceSheetFormats(
        activeWorkbookSession.doc,
        activeSheetId,
        nextFormats
      );
      await controller.persistActiveWorkbookMeta();
    },
    deleteRows: async (startRow, rowCount) => {
      if (controller.isViewerAccess()) {
        return;
      }

      const activeWorkbookSession = controller.getActiveWorkbookSession();
      const activeSheetId = get().activeSheetId;
      if (!(activeWorkbookSession && activeSheetId)) {
        return;
      }

      if (rowCount <= 0 || startRow < 0) {
        return;
      }

      const endRow = startRow + rowCount;
      const currentColumns = controller.buildColumnNames(
        get().activeSheetColumns
      );
      const currentFormats = get().activeSheetFormats;
      const currentRowHeights = get().activeSheetRowHeights;
      const nextCells: Record<string, string> = {};

      for (const [storedCellKey, cellValue] of Object.entries(
        get().activeSheetCells
      )) {
        const position = parseStoredCellId(storedCellKey);
        if (!position) {
          continue;
        }

        if (position.row >= startRow && position.row < endRow) {
          continue;
        }

        const nextRow =
          position.row >= endRow ? position.row - rowCount : position.row;
        nextCells[cellId(nextRow, position.col)] = rewriteFormulaReferences(
          cellValue.raw,
          currentColumns,
          currentColumns,
          (referencePosition) => {
            if (
              referencePosition.row >= startRow &&
              referencePosition.row < endRow
            ) {
              return "deleted";
            }

            if (referencePosition.row >= endRow) {
              return {
                col: referencePosition.col,
                row: referencePosition.row - rowCount,
              };
            }

            return referencePosition;
          }
        );
      }

      const nextRowHeights = Object.fromEntries(
        Object.entries(currentRowHeights).flatMap(([rowKey, height]) => {
          const rowIndex = Number(rowKey);
          if (!Number.isInteger(rowIndex)) {
            return [];
          }

          if (rowIndex >= startRow && rowIndex < endRow) {
            return [];
          }

          if (rowIndex >= endRow) {
            return [[String(rowIndex - rowCount), height] as const];
          }

          return [[rowKey, height] as const];
        })
      );
      const nextFormats = Object.fromEntries(
        Object.entries(currentFormats).flatMap(([cellKey, format]) => {
          const position = parseStoredCellId(cellKey);
          if (!position) {
            return [];
          }

          if (position.row >= startRow && position.row < endRow) {
            return [];
          }

          if (position.row >= endRow) {
            return [
              [cellId(position.row - rowCount, position.col), format] as const,
            ];
          }

          return [[cellKey, format] as const];
        })
      );

      set({ saveState: "saving" });
      replaceSheetCells(activeWorkbookSession.doc, activeSheetId, nextCells);
      replaceSheetFormats(
        activeWorkbookSession.doc,
        activeSheetId,
        nextFormats
      );
      replaceSheetRowHeights(
        activeWorkbookSession.doc,
        activeSheetId,
        nextRowHeights
      );
      await controller.persistActiveWorkbookMeta();
    },
    redo: async () => {
      const activeWorkbookSession = controller.getActiveWorkbookSession();
      if (
        !(
          activeWorkbookSession?.undoManager &&
          activeWorkbookSession.undoManager.redoStack.length > 0
        )
      ) {
        return;
      }

      set({ saveState: "saving" });
      activeWorkbookSession.undoManager.redo();
      await controller.persistActiveWorkbookMeta();
    },
    renameColumn: async (columnIndex, columnName) => {
      if (controller.isViewerAccess()) {
        return false;
      }

      const activeWorkbookSession = controller.getActiveWorkbookSession();
      const activeSheetId = get().activeSheetId;
      const currentColumn = get().activeSheetColumns[columnIndex];
      if (!(activeWorkbookSession && activeSheetId && currentColumn)) {
        return false;
      }

      const normalizedName = normalizeColumnName(columnName);
      const hasDuplicateName = get().activeSheetColumns.some(
        (column) =>
          column.index !== columnIndex &&
          column.name.toUpperCase() === normalizedName.toUpperCase()
      );

      if (!isValidColumnName(normalizedName) || hasDuplicateName) {
        return false;
      }

      if (normalizedName === currentColumn.name) {
        return true;
      }

      set({ saveState: "saving" });
      renameSheetColumn(
        activeWorkbookSession.doc,
        activeSheetId,
        columnIndex,
        normalizedName
      );

      const rewrittenFormulas = Object.fromEntries(
        Object.entries(get().activeSheetCells)
          .map(([cellKey, cellValue]) => [
            cellKey,
            rewriteFormulaColumnName(
              cellValue.raw,
              currentColumn.name,
              normalizedName
            ),
          ])
          .filter(([_, nextRaw]) => nextRaw.startsWith("="))
      );

      if (Object.keys(rewrittenFormulas).length > 0) {
        setSheetCellValues(
          activeWorkbookSession.doc,
          activeSheetId,
          rewrittenFormulas
        );
      }

      await controller.persistActiveWorkbookMeta();
      return true;
    },
    resizeColumn: async (columnIndex, width) => {
      if (controller.isViewerAccess()) {
        return;
      }

      const activeWorkbookSession = controller.getActiveWorkbookSession();
      const activeSheetId = get().activeSheetId;
      if (!(activeWorkbookSession && activeSheetId)) {
        return;
      }

      set({ saveState: "saving" });
      setSheetColumnWidth(
        activeWorkbookSession.doc,
        activeSheetId,
        columnIndex,
        width
      );
      await controller.persistActiveWorkbookMeta();
    },
    resizeRow: async (rowIndex, height) => {
      if (controller.isViewerAccess()) {
        return;
      }

      const activeWorkbookSession = controller.getActiveWorkbookSession();
      const activeSheetId = get().activeSheetId;
      if (!(activeWorkbookSession && activeSheetId)) {
        return;
      }

      set({ saveState: "saving" });
      setSheetRowHeight(
        activeWorkbookSession.doc,
        activeSheetId,
        rowIndex,
        height
      );
      await controller.persistActiveWorkbookMeta();
    },
    renameWorkbook: async (name) => {
      const activeWorkbookSession = controller.getActiveWorkbookSession();
      if (!activeWorkbookSession || controller.isViewerAccess()) {
        return;
      }

      set({ saveState: "saving" });
      renameWorkbookInDoc(activeWorkbookSession.doc, name);
      await controller.persistActiveWorkbookMeta();
    },
    setActiveSheet: async (sheetId) => {
      const activeWorkbookSession = controller.getActiveWorkbookSession();
      if (!activeWorkbookSession) {
        return;
      }

      set({ saveState: "saving" });
      setActiveSheetInDoc(activeWorkbookSession.doc, sheetId);
      touchWorkbook(activeWorkbookSession.doc, sheetId);
      controller.syncUndoManager(activeWorkbookSession.doc);
      await controller.persistActiveWorkbookMeta();
    },
    setCellFormats: async (values) => {
      if (controller.isViewerAccess()) {
        return;
      }

      const activeWorkbookSession = controller.getActiveWorkbookSession();
      const activeSheetId = get().activeSheetId;
      if (!(activeWorkbookSession && activeSheetId)) {
        return;
      }

      set({ saveState: "saving" });
      setSheetFormats(activeWorkbookSession.doc, activeSheetId, values);
      await controller.persistActiveWorkbookMeta();
    },
    setCellValue: async (row, col, raw) => {
      if (controller.isViewerAccess()) {
        return;
      }

      const activeWorkbookSession = controller.getActiveWorkbookSession();
      const activeSheetId = get().activeSheetId;
      if (!(activeWorkbookSession && activeSheetId)) {
        return;
      }

      set({ saveState: "saving" });
      setSheetCellRaw(
        activeWorkbookSession.doc,
        activeSheetId,
        cellId(row, col),
        raw
      );
      await controller.persistActiveWorkbookMeta();
    },
    setCellValuesByKey: async (values) => {
      if (controller.isViewerAccess()) {
        return;
      }

      const activeWorkbookSession = controller.getActiveWorkbookSession();
      const activeSheetId = get().activeSheetId;
      if (!(activeWorkbookSession && activeSheetId)) {
        return;
      }

      set({ saveState: "saving" });
      setSheetCellValues(activeWorkbookSession.doc, activeSheetId, values);
      await controller.persistActiveWorkbookMeta();
    },
    setWorkbookFavorite: async (isFavorite) => {
      const activeWorkbookSession = controller.getActiveWorkbookSession();
      if (!activeWorkbookSession || controller.isViewerAccess()) {
        return;
      }

      set({ saveState: "saving" });
      setWorkbookFavorite(activeWorkbookSession.doc, isFavorite);
      await controller.persistActiveWorkbookMeta();
    },
    setWorkbookSharingAccessRole: async (
      accessRole: CollaborationAccessRole
    ) => {
      const activeWorkbookSession = controller.getActiveWorkbookSession();
      const currentAuthenticatedUser = controller.getCurrentAuthenticatedUser();
      if (
        !(activeWorkbookSession && currentAuthenticatedUser) ||
        controller.isViewerAccess()
      ) {
        return false;
      }

      const previousAccessRole = getWorkbookMeta(
        activeWorkbookSession.doc
      ).sharingAccessRole;
      if (previousAccessRole === accessRole) {
        return true;
      }

      set({ saveState: "saving" });
      return await updateSharingState(
        controller,
        set,
        () => {
          setWorkbookSharingAccessRole(activeWorkbookSession.doc, accessRole);
        },
        () => {
          setWorkbookSharingAccessRole(
            activeWorkbookSession.doc,
            previousAccessRole
          );
        }
      );
    },
    setWorkbookSharingEnabled: async (sharingEnabled) => {
      const activeWorkbookSession = controller.getActiveWorkbookSession();
      const currentAuthenticatedUser = controller.getCurrentAuthenticatedUser();
      if (
        !(activeWorkbookSession && currentAuthenticatedUser) ||
        controller.isViewerAccess()
      ) {
        return false;
      }

      const previousSharingEnabled = getWorkbookMeta(
        activeWorkbookSession.doc
      ).sharingEnabled;
      if (previousSharingEnabled === sharingEnabled) {
        return true;
      }

      set({ saveState: "saving" });
      return await updateSharingState(
        controller,
        set,
        () => {
          setWorkbookSharingEnabled(activeWorkbookSession.doc, sharingEnabled);
        },
        () => {
          setWorkbookSharingEnabled(
            activeWorkbookSession.doc,
            previousSharingEnabled
          );
        }
      );
    },
    sheets: [],
    undo: async () => {
      const activeWorkbookSession = controller.getActiveWorkbookSession();
      if (
        !(
          activeWorkbookSession?.undoManager &&
          activeWorkbookSession.undoManager.undoStack.length > 0
        )
      ) {
        return;
      }

      set({ saveState: "saving" });
      activeWorkbookSession.undoManager.undo();
      await controller.persistActiveWorkbookMeta();
    },
    workerResetKey: "initial",
  });
};
