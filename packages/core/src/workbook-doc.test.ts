import { describe, expect, test } from "bun:test";
import { Doc, Map as YMap } from "yjs";
import {
  createSheet,
  createSheetId,
  createSheetUndoManager,
  createWorkbookId,
  deleteSheet,
  ensureWorkbookInitialized,
  getActiveSheetId,
  getSheetCells,
  getSheetColumns,
  getSheetFormats,
  getSheetRowHeights,
  getSheets,
  getWorkbookMeta,
  getWorkbookSnapshot,
  renameSheet,
  renameSheetColumn,
  renameWorkbook,
  replaceSheetCells,
  replaceSheetColumns,
  replaceSheetFormats,
  replaceSheetRowHeights,
  resetWorkbook,
  setActiveSheet,
  setSheetCellRaw,
  setSheetCellValues,
  setSheetColumnWidth,
  setSheetFormats,
  setSheetRowHeight,
  setWorkbookFavorite,
  setWorkbookSharingAccessRole,
  setWorkbookSharingEnabled,
  touchWorkbook,
} from "./workbook-doc";

const ROOT_SHEETS_KEY = "sheets";
const ROOT_SHEET_ORDER_KEY = "sheetOrder";
const SHEET_COLUMN_WIDTHS_KEY = "columnWidths";
const SHEET_FORMATS_KEY = "formats";
const SHEET_ROW_HEIGHTS_KEY = "rowHeights";

function createInitializedWorkbook() {
  const doc = new Doc();
  ensureWorkbookInitialized(doc, {
    initialSheetName: "  Launch Plan  ",
    name: "  Quarterly Plan  ",
    workbookId: "workbook-1",
  });

  const activeSheetId = getActiveSheetId(doc);
  if (!activeSheetId) {
    throw new Error("Expected the workbook to have an active sheet.");
  }

  return { activeSheetId, doc };
}

function getSheetInternalMap(doc: Doc, sheetId: string) {
  return doc.getMap<YMap<unknown>>(ROOT_SHEETS_KEY).get(sheetId) ?? null;
}

describe("workbook-doc", () => {
  test("creates ids and initializes a workbook only once", () => {
    expect(createWorkbookId()).toHaveLength(36);
    expect(createSheetId()).toHaveLength(36);

    const doc = new Doc();
    ensureWorkbookInitialized(doc, {
      initialSheetName: "  Launch Plan  ",
      name: "  Quarterly Plan  ",
      workbookId: "workbook-1",
    });

    const initialMeta = getWorkbookMeta(doc);
    const initialSheets = getSheets(doc);
    const initialActiveSheetId = getActiveSheetId(doc);

    expect(initialMeta).toMatchObject({
      id: "workbook-1",
      isFavorite: false,
      name: "Quarterly Plan",
      sharingAccessRole: "editor",
      sharingEnabled: false,
    });
    expect(initialSheets).toHaveLength(1);
    expect(initialSheets[0]).toMatchObject({
      id: initialActiveSheetId,
      name: "Launch Plan",
    });

    ensureWorkbookInitialized(doc, {
      initialSheetName: "Should not replace",
      name: "Should not replace",
      workbookId: "workbook-2",
    });

    expect(getWorkbookMeta(doc)).toEqual(initialMeta);
    expect(getSheets(doc)).toEqual(initialSheets);
    expect(getActiveSheetId(doc)).toBe(initialActiveSheetId);
  });

  test("updates workbook metadata helpers and resets the workbook", () => {
    const { doc, activeSheetId } = createInitializedWorkbook();
    const beforeTouch = getWorkbookMeta(doc).lastOpenedAt;

    touchWorkbook(doc, activeSheetId);
    expect(getWorkbookMeta(doc).lastOpenedAt >= beforeTouch).toBe(true);

    expect(renameWorkbook(doc, "   ")).toBe("Untitled spreadsheet");
    expect(setWorkbookFavorite(doc, true)).toBe(true);
    expect(setWorkbookSharingEnabled(doc, true)).toBe(true);
    expect(setWorkbookSharingAccessRole(doc, "viewer")).toBe("viewer");
    expect(getWorkbookMeta(doc)).toMatchObject({
      isFavorite: true,
      name: "Untitled spreadsheet",
      sharingAccessRole: "viewer",
      sharingEnabled: true,
    });

    resetWorkbook(doc, "test-origin");

    expect(getWorkbookMeta(doc)).toMatchObject({
      createdAt: "",
      id: "",
      isFavorite: false,
      lastOpenedAt: "",
      name: "Untitled spreadsheet",
      sharingAccessRole: "editor",
      sharingEnabled: false,
      updatedAt: "",
    });
    expect(getSheets(doc)).toEqual([]);
    expect(getActiveSheetId(doc)).toBeNull();
    expect(getWorkbookSnapshot(doc)).toEqual({
      activeSheetCells: {},
      activeSheetColumns: getSheetColumns(doc, null),
      activeSheetFormats: {},
      activeSheetId: null,
      activeSheetRowHeights: {},
      sheets: [],
      workbook: getWorkbookMeta(doc),
    });
  });

  test("manages sheet lifecycle and falls back safely for invalid operations", () => {
    const { doc, activeSheetId } = createInitializedWorkbook();

    expect(deleteSheet(doc, "missing-sheet")).toBeNull();
    expect(deleteSheet(doc, activeSheetId)).toBeNull();

    const nextSheet = createSheet(doc, "  Revenue  ");
    expect(nextSheet.name).toBe("Revenue");
    expect(getActiveSheetId(doc)).toBe(nextSheet.id);

    const previousLastOpenedAt = getWorkbookMeta(doc).lastOpenedAt;

    expect(renameSheet(doc, nextSheet.id, "   ")).toBe("Untitled sheet");
    setActiveSheet(doc, activeSheetId);
    expect(getActiveSheetId(doc)).toBe(activeSheetId);
    setActiveSheet(doc, "missing-sheet");
    expect(getActiveSheetId(doc)).toBe(activeSheetId);

    const deletedNextActiveSheetId = deleteSheet(doc, activeSheetId);
    expect(deletedNextActiveSheetId).toBe(nextSheet.id);
    expect(getActiveSheetId(doc)).toBe(nextSheet.id);
    expect(getWorkbookMeta(doc).lastOpenedAt >= previousLastOpenedAt).toBe(
      true
    );

    const sheetOrder = doc.getArray<string>(ROOT_SHEET_ORDER_KEY);
    sheetOrder.push(["missing-sheet"]);
    expect(getSheets(doc)).toEqual([
      expect.objectContaining({
        id: nextSheet.id,
        name: "Untitled sheet",
      }),
    ]);
  });

  test("reads and mutates sheet columns, widths, rows, and cells", () => {
    const { doc, activeSheetId } = createInitializedWorkbook();

    expect(getSheetColumns(doc, null, 3)).toEqual([
      { index: 0, name: "A", width: 100 },
      { index: 1, name: "B", width: 100 },
      { index: 2, name: "C", width: 100 },
    ]);
    expect(getSheetColumns(doc, "missing-sheet", 2)).toEqual([
      { index: 0, name: "A", width: 100 },
      { index: 1, name: "B", width: 100 },
    ]);

    expect(renameSheetColumn(doc, activeSheetId, 0, "  Revenue  ")).toBe(
      "Revenue"
    );
    expect(setSheetColumnWidth(doc, activeSheetId, 0, 180)).toBe(180);
    expect(setSheetRowHeight(doc, activeSheetId, 0, 48)).toBe(48);
    expect(renameSheetColumn(doc, "missing-sheet", 0, "Nope")).toBeNull();
    expect(setSheetColumnWidth(doc, "missing-sheet", 0, 180)).toBeNull();
    expect(setSheetRowHeight(doc, "missing-sheet", 0, 48)).toBeNull();

    setSheetCellRaw(doc, activeSheetId, "C0R0", "42");
    setSheetCellRaw(doc, activeSheetId, "C0R1", "");
    setSheetCellValues(doc, activeSheetId, {
      C1R0: "84",
      C1R1: "",
    });
    expect(getSheetCells(doc, activeSheetId)).toEqual({
      C0R0: { raw: "42" },
      C1R0: { raw: "84" },
    });
    expect(getSheetCells(doc, null)).toEqual({});
    expect(getSheetCells(doc, "missing-sheet")).toEqual({});

    replaceSheetCells(doc, activeSheetId, {
      C2R0: "126",
      C3R0: "",
    });
    expect(getSheetCells(doc, activeSheetId)).toEqual({
      C2R0: { raw: "126" },
    });

    replaceSheetColumns(doc, activeSheetId, [
      { index: 0, name: "A", width: 100 },
      { index: 1, name: "Profit", width: 140 },
    ]);
    replaceSheetRowHeights(doc, activeSheetId, {
      0: 28,
      1: 24,
    });

    expect(getSheetColumns(doc, activeSheetId, 2)).toEqual([
      { index: 0, name: "A", width: 100 },
      { index: 1, name: "Profit", width: 140 },
    ]);
    expect(getSheetRowHeights(doc, activeSheetId)).toEqual({ 0: 28, 1: 24 });

    const sheetMap = getSheetInternalMap(doc, activeSheetId);
    if (!(sheetMap instanceof YMap)) {
      throw new Error("Expected a Yjs sheet map.");
    }

    const rowHeights = sheetMap.get(SHEET_ROW_HEIGHTS_KEY) as YMap<number>;
    rowHeights.set("2", Number.NaN);
    rowHeights.set("3", Number.POSITIVE_INFINITY);

    expect(getSheetRowHeights(doc, activeSheetId)).toEqual({ 0: 28, 1: 24 });

    renameSheetColumn(doc, activeSheetId, 1, "B");
    setSheetColumnWidth(doc, activeSheetId, 1, 100);
    setSheetRowHeight(doc, activeSheetId, 0, 20);

    expect(getSheetColumns(doc, activeSheetId, 2)).toEqual([
      { index: 0, name: "A", width: 100 },
      { index: 1, name: "B", width: 100 },
    ]);
    expect(getSheetRowHeights(doc, activeSheetId)).toEqual({ 1: 24 });
  });

  test("normalizes, replaces, and ignores invalid cell formats", () => {
    const { doc, activeSheetId } = createInitializedWorkbook();

    setSheetFormats(doc, activeSheetId, {
      C0R0: {
        bold: true,
        fontFamily: "  Inter  ",
        fontSize: 16,
        italic: true,
        strikethrough: true,
        textColor: "  #111827  ",
        textTransform: "uppercase",
        underline: true,
      },
      C1R0: {
        fontFamily: "   ",
        fontSize: 0,
        textColor: "   ",
        textTransform: "titlecase" as never,
      },
      C2R0: null,
    });

    expect(getSheetFormats(doc, activeSheetId)).toEqual({
      C0R0: {
        bold: true,
        fontFamily: "Inter",
        fontSize: 16,
        italic: true,
        strikethrough: true,
        textColor: "#111827",
        textTransform: "uppercase",
        underline: true,
      },
    });
    expect(getSheetFormats(doc, null)).toEqual({});
    expect(getSheetFormats(doc, "missing-sheet")).toEqual({});

    const sheetMap = getSheetInternalMap(doc, activeSheetId);
    if (!(sheetMap instanceof YMap)) {
      throw new Error("Expected a Yjs sheet map.");
    }

    const formats = sheetMap.get(SHEET_FORMATS_KEY) as YMap<string>;
    formats.set("C3R0", "{not-json");

    expect(getSheetFormats(doc, activeSheetId)).toEqual({
      C0R0: {
        bold: true,
        fontFamily: "Inter",
        fontSize: 16,
        italic: true,
        strikethrough: true,
        textColor: "#111827",
        textTransform: "uppercase",
        underline: true,
      },
    });

    replaceSheetFormats(doc, activeSheetId, {
      C9R0: {
        fontSize: 14,
        textColor: "#2563eb",
      },
      C10R0: {
        fontFamily: "   ",
      },
    });

    expect(getSheetFormats(doc, activeSheetId)).toEqual({
      C9R0: {
        fontSize: 14,
        textColor: "#2563eb",
      },
    });
  });

  test("creates undo managers and derives workbook snapshots from stored state", () => {
    const { doc, activeSheetId } = createInitializedWorkbook();

    expect(createSheetUndoManager(doc, null)).toBeNull();
    expect(createSheetUndoManager(doc, "missing-sheet")).toBeNull();

    const undoManager = createSheetUndoManager(doc, activeSheetId);
    expect(undoManager).not.toBeNull();

    setSheetCellRaw(doc, activeSheetId, "C0R0", "alpha");
    undoManager?.undo();
    expect(getSheetCells(doc, activeSheetId)).toEqual({});
    undoManager?.redo();
    expect(getSheetCells(doc, activeSheetId)).toEqual({
      C0R0: { raw: "alpha" },
    });

    setSheetCellValues(doc, activeSheetId, {
      C105R0: "wide-value",
    });
    setSheetColumnWidth(doc, activeSheetId, 108, 220);
    setSheetFormats(doc, activeSheetId, {
      C107R0: {
        fontSize: 13,
      },
    });

    const snapshot = getWorkbookSnapshot(doc);

    expect(snapshot.activeSheetId).toBe(activeSheetId);
    expect(snapshot.activeSheetCells.C105R0).toEqual({ raw: "wide-value" });
    expect(snapshot.activeSheetFormats.C107R0).toEqual({ fontSize: 13 });
    expect(snapshot.activeSheetColumns).toHaveLength(109);
    expect(snapshot.activeSheetColumns[107]).toEqual({
      index: 107,
      name: "DD",
      width: 100,
    });
    expect(snapshot.activeSheetColumns[108]).toEqual({
      index: 108,
      name: "DE",
      width: 220,
    });
  });

  test("fails closed when sheet internals are missing or malformed", () => {
    const { doc, activeSheetId } = createInitializedWorkbook();
    const sheetMap = getSheetInternalMap(doc, activeSheetId);
    if (!(sheetMap instanceof YMap)) {
      throw new Error("Expected a Yjs sheet map.");
    }

    sheetMap.set("cells", "invalid");
    sheetMap.set("columns", "invalid");
    sheetMap.set("columnWidths", "invalid");
    sheetMap.set("formats", "invalid");
    sheetMap.set("rowHeights", "invalid");

    expect(getSheetCells(doc, activeSheetId)).toEqual({});
    expect(getSheetColumns(doc, activeSheetId, 2)).toEqual([
      { index: 0, name: "A", width: 100 },
      { index: 1, name: "B", width: 100 },
    ]);
    expect(getSheetFormats(doc, activeSheetId)).toEqual({});
    expect(getSheetRowHeights(doc, activeSheetId)).toEqual({});

    setSheetCellRaw(doc, activeSheetId, "C0R0", "42");
    setSheetCellValues(doc, activeSheetId, { C0R0: "42" });
    replaceSheetCells(doc, activeSheetId, { C0R0: "42" });

    expect(renameSheetColumn(doc, activeSheetId, 0, "Revenue")).toBeNull();
    expect(renameSheet(doc, "missing-sheet", "Revenue")).toBeNull();
    setSheetFormats(doc, "missing-sheet", { C0R0: { bold: true } });
    replaceSheetColumns(doc, "missing-sheet", []);
    replaceSheetRowHeights(doc, "missing-sheet", {});
    replaceSheetFormats(doc, "missing-sheet", {});

    const nextSheet = createSheet(doc);
    expect(nextSheet.name).toBe("Sheet2");

    const meta = doc.getMap("meta");
    meta.set("activeSheetId", "missing-sheet");
    const snapshot = getWorkbookSnapshot(doc);
    expect(snapshot.activeSheetId).toBe("missing-sheet");
    expect(snapshot.activeSheetColumns).toHaveLength(100);
  });

  test("reuses existing sheet internals and rejects impossible sheet order state", () => {
    const existingSheetId = "11111111-1111-1111-1111-111111111111";
    const originalRandomUuid = crypto.randomUUID;
    const doc = new Doc();
    const sheets = doc.getMap<YMap<unknown>>(ROOT_SHEETS_KEY);
    const existingSheet = new YMap<unknown>();

    existingSheet.set("id", existingSheetId);
    existingSheet.set("name", "Seeded");
    sheets.set(existingSheetId, existingSheet);

    try {
      crypto.randomUUID = () => existingSheetId;

      ensureWorkbookInitialized(doc, {
        workbookId: "workbook-reused",
      });

      expect(getSheets(doc)).toEqual([
        expect.objectContaining({
          id: existingSheetId,
          name: "Seeded",
        }),
      ]);

      const reusedSheet = getSheetInternalMap(doc, existingSheetId);
      if (!(reusedSheet instanceof YMap)) {
        throw new Error("Expected the reused sheet to stay mounted.");
      }

      reusedSheet.delete("cells");
      reusedSheet.delete("columns");
      reusedSheet.delete(SHEET_COLUMN_WIDTHS_KEY);
      reusedSheet.delete(SHEET_FORMATS_KEY);

      expect(getSheetColumns(doc, existingSheetId, 3)).toEqual([
        { index: 0, name: "A", width: 100 },
        { index: 1, name: "B", width: 100 },
        { index: 2, name: "C", width: 100 },
      ]);
      doc.getMap("meta").set("activeSheetId", existingSheetId);
      expect(getWorkbookSnapshot(doc).activeSheetColumns).toHaveLength(100);

      const invalidOrderDoc = new Doc();
      ensureWorkbookInitialized(invalidOrderDoc, {
        workbookId: "workbook-invalid-order",
      });

      const invalidActiveSheetId = getActiveSheetId(invalidOrderDoc);
      if (!invalidActiveSheetId) {
        throw new Error("Expected an active sheet for the invalid order test.");
      }

      const invalidSheetOrder =
        invalidOrderDoc.getArray<unknown>(ROOT_SHEET_ORDER_KEY);
      invalidSheetOrder.delete(0, invalidSheetOrder.length);
      invalidSheetOrder.push([null, invalidActiveSheetId]);

      expect(deleteSheet(invalidOrderDoc, invalidActiveSheetId)).toBeNull();
    } finally {
      crypto.randomUUID = originalRandomUuid;
    }
  });
});
