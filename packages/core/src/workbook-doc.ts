import { type Doc, UndoManager, type Array as YArray, Map as YMap } from "yjs";
import type { CollaborationAccessRole } from "./collaboration-types";
import {
  type CellFormat,
  DEFAULT_SHEET_COLUMN_WIDTH,
  DEFAULT_SHEET_ROW_HEIGHT,
  type PersistedCellRecord,
  type SheetColumn,
  type SheetMeta,
  type WorkbookMeta,
  type WorkbookSnapshot,
} from "./workbook-types";

const ROOT_META_KEY = "meta";
const ROOT_SHEETS_KEY = "sheets";
const ROOT_SHEET_ORDER_KEY = "sheetOrder";
const STORED_CELL_KEY_PATTERN = /^C(\d+)R\d+$/;
const SHEET_CELLS_KEY = "cells";
const SHEET_COLUMNS_KEY = "columns";
const SHEET_COLUMN_WIDTHS_KEY = "columnWidths";
const SHEET_FORMATS_KEY = "formats";
const SHEET_ROW_HEIGHTS_KEY = "rowHeights";
const DEFAULT_WORKBOOK_NAME = "Untitled spreadsheet";
const DEFAULT_SHEET_NAME_PREFIX = "Sheet";
const DEFAULT_COLUMN_COUNT = 100;
const DEFAULT_SHARING_ACCESS_ROLE: CollaborationAccessRole = "editor";

function getNowIsoString(): string {
  return new Date().toISOString();
}

function getMetaMap(doc: Doc): YMap<unknown> {
  return doc.getMap(ROOT_META_KEY);
}

function getSheetsMap(doc: Doc): YMap<YMap<unknown>> {
  return doc.getMap(ROOT_SHEETS_KEY) as YMap<YMap<unknown>>;
}

function getSheetOrder(doc: Doc): YArray<string> {
  return doc.getArray<string>(ROOT_SHEET_ORDER_KEY);
}

function getSheetMap(doc: Doc, sheetId: string): YMap<unknown> | null {
  return getSheetsMap(doc).get(sheetId) ?? null;
}

function getSheetCellsMap(doc: Doc, sheetId: string): YMap<string> | null {
  const sheet = getSheetMap(doc, sheetId);
  if (!sheet) {
    return null;
  }

  const cells = sheet.get(SHEET_CELLS_KEY);
  if (cells instanceof YMap) {
    return cells as YMap<string>;
  }

  return null;
}

function getSheetColumnsMap(doc: Doc, sheetId: string): YMap<string> | null {
  const sheet = getSheetMap(doc, sheetId);
  if (!sheet) {
    return null;
  }

  const columns = sheet.get(SHEET_COLUMNS_KEY);
  if (columns instanceof YMap) {
    return columns as YMap<string>;
  }

  return null;
}

function getSheetColumnWidthsMap(
  doc: Doc,
  sheetId: string
): YMap<number> | null {
  const sheet = getSheetMap(doc, sheetId);
  if (!sheet) {
    return null;
  }

  const columnWidths = sheet.get(SHEET_COLUMN_WIDTHS_KEY);
  if (columnWidths instanceof YMap) {
    return columnWidths as YMap<number>;
  }

  const nextColumnWidths = new YMap<number>();
  sheet.set(SHEET_COLUMN_WIDTHS_KEY, nextColumnWidths);
  return nextColumnWidths;
}

function getSheetFormatsMap(doc: Doc, sheetId: string): YMap<string> | null {
  const sheet = getSheetMap(doc, sheetId);
  if (!sheet) {
    return null;
  }

  const formats = sheet.get(SHEET_FORMATS_KEY);
  if (formats instanceof YMap) {
    return formats as YMap<string>;
  }

  const nextFormats = new YMap<string>();
  sheet.set(SHEET_FORMATS_KEY, nextFormats);
  return nextFormats;
}

function getSheetRowHeightsMap(doc: Doc, sheetId: string): YMap<number> | null {
  const sheet = getSheetMap(doc, sheetId);
  if (!sheet) {
    return null;
  }

  const rowHeights = sheet.get(SHEET_ROW_HEIGHTS_KEY);
  if (rowHeights instanceof YMap) {
    return rowHeights as YMap<number>;
  }

  const nextRowHeights = new YMap<number>();
  sheet.set(SHEET_ROW_HEIGHTS_KEY, nextRowHeights);
  return nextRowHeights;
}

function getStringValue(
  map: YMap<unknown>,
  key: string,
  fallback = ""
): string {
  const value = map.get(key);
  return typeof value === "string" ? value : fallback;
}

function getBooleanValue(
  map: YMap<unknown>,
  key: string,
  fallback = false
): boolean {
  const value = map.get(key);
  return typeof value === "boolean" ? value : fallback;
}

function getNumberValue(map: YMap<number> | null, key: string): number | null {
  const value = map?.get(key);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getLargestNumericKeyIndex(map: YMap<unknown> | null): number {
  if (!map) {
    return -1;
  }

  let largestIndex = -1;

  for (const key of map.keys()) {
    const index = Number.parseInt(key, 10);
    if (!Number.isNaN(index)) {
      largestIndex = Math.max(largestIndex, index);
    }
  }

  return largestIndex;
}

function getLargestStoredCellColumnIndex(map: YMap<unknown> | null): number {
  if (!map) {
    return -1;
  }

  let largestIndex = -1;

  for (const key of map.keys()) {
    const match = STORED_CELL_KEY_PATTERN.exec(key);
    if (!match?.[1]) {
      continue;
    }

    const index = Number.parseInt(match[1], 10);
    if (!Number.isNaN(index)) {
      largestIndex = Math.max(largestIndex, index);
    }
  }

  return largestIndex;
}

function getSheetColumnCount(doc: Doc, sheetId: string | null): number {
  if (!sheetId) {
    return DEFAULT_COLUMN_COUNT;
  }

  const sheet = getSheetMap(doc, sheetId);
  if (!sheet) {
    return DEFAULT_COLUMN_COUNT;
  }

  const cells = sheet.get(SHEET_CELLS_KEY);
  const columns = sheet.get(SHEET_COLUMNS_KEY);
  const columnWidths = sheet.get(SHEET_COLUMN_WIDTHS_KEY);
  const formats = sheet.get(SHEET_FORMATS_KEY);

  const largestColumnIndex = Math.max(
    DEFAULT_COLUMN_COUNT - 1,
    getLargestStoredCellColumnIndex(cells instanceof YMap ? cells : null),
    getLargestNumericKeyIndex(columns instanceof YMap ? columns : null),
    getLargestNumericKeyIndex(
      columnWidths instanceof YMap ? columnWidths : null
    ),
    getLargestStoredCellColumnIndex(formats instanceof YMap ? formats : null)
  );

  return largestColumnIndex + 1;
}

function normalizeCellFormat(
  format: CellFormat | null | undefined
): CellFormat | null {
  if (!format) {
    return null;
  }

  const normalizedFormat: CellFormat = {};

  if (format.bold) {
    normalizedFormat.bold = true;
  }
  if (format.fontFamily?.trim()) {
    normalizedFormat.fontFamily = format.fontFamily.trim();
  }
  if (
    typeof format.fontSize === "number" &&
    Number.isFinite(format.fontSize) &&
    format.fontSize > 0
  ) {
    normalizedFormat.fontSize = format.fontSize;
  }
  if (format.italic) {
    normalizedFormat.italic = true;
  }
  if (format.strikethrough) {
    normalizedFormat.strikethrough = true;
  }
  if (format.textColor?.trim()) {
    normalizedFormat.textColor = format.textColor.trim();
  }
  if (
    format.textTransform === "uppercase" ||
    format.textTransform === "lowercase"
  ) {
    normalizedFormat.textTransform = format.textTransform;
  }
  if (format.underline) {
    normalizedFormat.underline = true;
  }

  return Object.keys(normalizedFormat).length > 0 ? normalizedFormat : null;
}

function parseCellFormat(value: string): CellFormat | null {
  try {
    const parsedValue = JSON.parse(value) as CellFormat;
    return normalizeCellFormat(parsedValue);
  } catch {
    return null;
  }
}

function serializeCellFormat(format: CellFormat): string {
  return JSON.stringify(format);
}

function ensureSheet(doc: Doc, sheetId: string, name: string): void {
  const sheets = getSheetsMap(doc);
  if (sheets.has(sheetId)) {
    return;
  }

  const now = getNowIsoString();
  const sheet = new YMap<unknown>();
  const cells = new YMap<string>();
  const columns = new YMap<string>();
  const columnWidths = new YMap<number>();
  const formats = new YMap<string>();
  const rowHeights = new YMap<number>();

  sheet.set("id", sheetId);
  sheet.set("name", name);
  sheet.set("createdAt", now);
  sheet.set("updatedAt", now);
  sheet.set(SHEET_CELLS_KEY, cells);
  sheet.set(SHEET_COLUMNS_KEY, columns);
  sheet.set(SHEET_COLUMN_WIDTHS_KEY, columnWidths);
  sheet.set(SHEET_FORMATS_KEY, formats);
  sheet.set(SHEET_ROW_HEIGHTS_KEY, rowHeights);
  sheets.set(sheetId, sheet);
}

function getDefaultSheetName(sheetCount: number): string {
  return `${DEFAULT_SHEET_NAME_PREFIX}${sheetCount + 1}`;
}

function getDefaultColumnName(columnIndex: number): string {
  let result = "";
  let currentIndex = columnIndex;

  while (currentIndex >= 0) {
    result = String.fromCharCode((currentIndex % 26) + 65) + result;
    currentIndex = Math.floor(currentIndex / 26) - 1;
  }

  return result;
}

export function createWorkbookId(): string {
  return crypto.randomUUID();
}

export function createSheetId(): string {
  return crypto.randomUUID();
}

export function ensureWorkbookInitialized(
  doc: Doc,
  options: {
    initialSheetName?: string;
    name?: string;
    workbookId: string;
  }
): void {
  const meta = getMetaMap(doc);
  const sheetOrder = getSheetOrder(doc);
  const sheets = getSheetsMap(doc);

  doc.transact(() => {
    const now = getNowIsoString();

    if (!meta.has("id")) {
      meta.set("id", options.workbookId);
    }
    if (!meta.has("name")) {
      meta.set("name", options.name?.trim() || DEFAULT_WORKBOOK_NAME);
    }
    if (!meta.has("createdAt")) {
      meta.set("createdAt", now);
    }
    if (!meta.has("updatedAt")) {
      meta.set("updatedAt", now);
    }
    if (!meta.has("lastOpenedAt")) {
      meta.set("lastOpenedAt", now);
    }
    if (!meta.has("isFavorite")) {
      meta.set("isFavorite", false);
    }
    if (!meta.has("sharingEnabled")) {
      meta.set("sharingEnabled", false);
    }
    if (!meta.has("sharingAccessRole")) {
      meta.set("sharingAccessRole", DEFAULT_SHARING_ACCESS_ROLE);
    }
    if (sheetOrder.length === 0 || sheets.size === 0) {
      const firstSheetId = createSheetId();
      ensureSheet(
        doc,
        firstSheetId,
        options.initialSheetName?.trim() || getDefaultSheetName(0)
      );
      sheetOrder.push([firstSheetId]);
      meta.set("activeSheetId", firstSheetId);
    }
  });
}

export function resetWorkbook(doc: Doc, origin?: unknown): void {
  const meta = getMetaMap(doc);
  const sheetOrder = getSheetOrder(doc);
  const sheets = getSheetsMap(doc);

  doc.transact(() => {
    meta.clear();
    sheets.clear();

    if (sheetOrder.length > 0) {
      sheetOrder.delete(0, sheetOrder.length);
    }
  }, origin);
}

export function touchWorkbook(doc: Doc, activeSheetId?: string): void {
  const meta = getMetaMap(doc);
  const now = getNowIsoString();

  doc.transact(() => {
    meta.set("lastOpenedAt", now);
    if (activeSheetId) {
      meta.set("activeSheetId", activeSheetId);
    }
  });
}

export function renameWorkbook(doc: Doc, nextName: string): string {
  const trimmedName = nextName.trim() || DEFAULT_WORKBOOK_NAME;
  const meta = getMetaMap(doc);
  const now = getNowIsoString();

  doc.transact(() => {
    meta.set("name", trimmedName);
    meta.set("updatedAt", now);
  });

  return trimmedName;
}

export function setWorkbookFavorite(doc: Doc, isFavorite: boolean): boolean {
  const meta = getMetaMap(doc);
  const now = getNowIsoString();

  doc.transact(() => {
    meta.set("isFavorite", isFavorite);
    meta.set("updatedAt", now);
  });

  return isFavorite;
}

export function setWorkbookSharingEnabled(
  doc: Doc,
  sharingEnabled: boolean
): boolean {
  const meta = getMetaMap(doc);
  const now = getNowIsoString();

  doc.transact(() => {
    meta.set("sharingEnabled", sharingEnabled);
    meta.set("updatedAt", now);
  });

  return sharingEnabled;
}

export function setWorkbookSharingAccessRole(
  doc: Doc,
  accessRole: CollaborationAccessRole
): CollaborationAccessRole {
  const meta = getMetaMap(doc);
  const now = getNowIsoString();

  doc.transact(() => {
    meta.set("sharingAccessRole", accessRole);
    meta.set("updatedAt", now);
  });

  return accessRole;
}

export function createSheet(doc: Doc, name?: string): SheetMeta {
  const sheetOrder = getSheetOrder(doc);
  const nextSheetId = createSheetId();
  const nextSheetName = name?.trim() || getDefaultSheetName(sheetOrder.length);
  const now = getNowIsoString();

  doc.transact(() => {
    ensureSheet(doc, nextSheetId, nextSheetName);
    sheetOrder.push([nextSheetId]);
    const meta = getMetaMap(doc);
    meta.set("activeSheetId", nextSheetId);
    meta.set("updatedAt", now);
  });

  return {
    createdAt: now,
    id: nextSheetId,
    name: nextSheetName,
    updatedAt: now,
  };
}

export function getSheetColumns(
  doc: Doc,
  sheetId: string | null,
  columnCount = DEFAULT_COLUMN_COUNT
): SheetColumn[] {
  if (!sheetId) {
    return Array.from({ length: columnCount }, (_, index) => ({
      index,
      name: getDefaultColumnName(index),
      width: DEFAULT_SHEET_COLUMN_WIDTH,
    }));
  }

  const columns = getSheetColumnsMap(doc, sheetId);
  const columnWidths = getSheetColumnWidthsMap(doc, sheetId);
  return Array.from({ length: columnCount }, (_, index) => ({
    index,
    name: columns?.get(String(index)) ?? getDefaultColumnName(index),
    width:
      getNumberValue(columnWidths, String(index)) ?? DEFAULT_SHEET_COLUMN_WIDTH,
  }));
}

export function getSheetRowHeights(
  doc: Doc,
  sheetId: string | null
): Record<string, number> {
  if (!sheetId) {
    return {};
  }

  const rowHeights = getSheetRowHeightsMap(doc, sheetId);
  if (!rowHeights) {
    return {};
  }

  const result: Record<string, number> = {};
  for (const [rowKey, height] of rowHeights.entries()) {
    if (!Number.isFinite(height)) {
      continue;
    }

    result[rowKey] = height;
  }

  return result;
}

export function getSheetFormats(
  doc: Doc,
  sheetId: string | null
): Record<string, CellFormat> {
  if (!sheetId) {
    return {};
  }

  const formats = getSheetFormatsMap(doc, sheetId);
  if (!formats) {
    return {};
  }

  const result: Record<string, CellFormat> = {};
  for (const [cellKey, serializedFormat] of formats.entries()) {
    const parsedFormat = parseCellFormat(serializedFormat);
    if (!parsedFormat) {
      continue;
    }

    result[cellKey] = parsedFormat;
  }

  return result;
}

export function renameSheetColumn(
  doc: Doc,
  sheetId: string,
  columnIndex: number,
  columnName: string
): string | null {
  const columns = getSheetColumnsMap(doc, sheetId);
  const sheet = getSheetMap(doc, sheetId);
  if (!(columns && sheet)) {
    return null;
  }

  const normalizedName = columnName.trim();
  const defaultName = getDefaultColumnName(columnIndex);
  const now = getNowIsoString();

  doc.transact(() => {
    if (normalizedName === defaultName) {
      columns.delete(String(columnIndex));
    } else {
      columns.set(String(columnIndex), normalizedName);
    }

    sheet.set("updatedAt", now);
    getMetaMap(doc).set("updatedAt", now);
  });

  return normalizedName;
}

export function setSheetColumnWidth(
  doc: Doc,
  sheetId: string,
  columnIndex: number,
  width: number
): number | null {
  const columnWidths = getSheetColumnWidthsMap(doc, sheetId);
  const sheet = getSheetMap(doc, sheetId);
  if (!(columnWidths && sheet)) {
    return null;
  }

  const now = getNowIsoString();

  doc.transact(() => {
    if (width === DEFAULT_SHEET_COLUMN_WIDTH) {
      columnWidths.delete(String(columnIndex));
    } else {
      columnWidths.set(String(columnIndex), width);
    }

    sheet.set("updatedAt", now);
    getMetaMap(doc).set("updatedAt", now);
  });

  return width;
}

export function setSheetRowHeight(
  doc: Doc,
  sheetId: string,
  rowIndex: number,
  height: number
): number | null {
  const rowHeights = getSheetRowHeightsMap(doc, sheetId);
  const sheet = getSheetMap(doc, sheetId);
  if (!(rowHeights && sheet)) {
    return null;
  }

  const now = getNowIsoString();

  doc.transact(() => {
    if (height === DEFAULT_SHEET_ROW_HEIGHT) {
      rowHeights.delete(String(rowIndex));
    } else {
      rowHeights.set(String(rowIndex), height);
    }

    sheet.set("updatedAt", now);
    getMetaMap(doc).set("updatedAt", now);
  });

  return height;
}

export function setSheetFormats(
  doc: Doc,
  sheetId: string,
  values: Record<string, CellFormat | null>
): void {
  const formats = getSheetFormatsMap(doc, sheetId);
  const sheet = getSheetMap(doc, sheetId);
  if (!(formats && sheet)) {
    return;
  }

  const now = getNowIsoString();

  doc.transact(() => {
    for (const [cellKey, format] of Object.entries(values)) {
      const normalizedFormat = normalizeCellFormat(format);
      if (!normalizedFormat) {
        formats.delete(cellKey);
        continue;
      }

      formats.set(cellKey, serializeCellFormat(normalizedFormat));
    }

    sheet.set("updatedAt", now);
    getMetaMap(doc).set("updatedAt", now);
  });
}

export function renameSheet(
  doc: Doc,
  sheetId: string,
  nextName: string
): string | null {
  const sheet = getSheetMap(doc, sheetId);
  if (!sheet) {
    return null;
  }

  const trimmedName = nextName.trim() || "Untitled sheet";
  const now = getNowIsoString();

  doc.transact(() => {
    sheet.set("name", trimmedName);
    sheet.set("updatedAt", now);
    getMetaMap(doc).set("updatedAt", now);
  });

  return trimmedName;
}

export function setActiveSheet(doc: Doc, sheetId: string): void {
  const sheet = getSheetMap(doc, sheetId);
  if (!sheet) {
    return;
  }

  const now = getNowIsoString();
  doc.transact(() => {
    const meta = getMetaMap(doc);
    meta.set("activeSheetId", sheetId);
    meta.set("lastOpenedAt", now);
  });
}

export function setSheetCellRaw(
  doc: Doc,
  sheetId: string,
  cellKey: string,
  raw: string
): void {
  const cells = getSheetCellsMap(doc, sheetId);
  if (!cells) {
    return;
  }

  const now = getNowIsoString();
  doc.transact(() => {
    const trimmedRaw = raw;
    if (trimmedRaw === "") {
      cells.delete(cellKey);
    } else {
      cells.set(cellKey, trimmedRaw);
    }

    const sheet = getSheetMap(doc, sheetId);
    if (sheet) {
      sheet.set("updatedAt", now);
    }

    getMetaMap(doc).set("updatedAt", now);
  });
}

export function setSheetCellValues(
  doc: Doc,
  sheetId: string,
  values: Record<string, string>
): void {
  const cells = getSheetCellsMap(doc, sheetId);
  const sheet = getSheetMap(doc, sheetId);
  if (!(cells && sheet)) {
    return;
  }

  const now = getNowIsoString();

  doc.transact(() => {
    for (const [cellKey, raw] of Object.entries(values)) {
      if (raw === "") {
        cells.delete(cellKey);
        continue;
      }

      cells.set(cellKey, raw);
    }

    sheet.set("updatedAt", now);
    getMetaMap(doc).set("updatedAt", now);
  });
}

export function replaceSheetCells(
  doc: Doc,
  sheetId: string,
  values: Record<string, string>
): void {
  const cells = getSheetCellsMap(doc, sheetId);
  const sheet = getSheetMap(doc, sheetId);
  if (!(cells && sheet)) {
    return;
  }

  const now = getNowIsoString();

  doc.transact(() => {
    for (const cellKey of [...cells.keys()]) {
      cells.delete(cellKey);
    }

    for (const [cellKey, raw] of Object.entries(values)) {
      if (raw === "") {
        continue;
      }

      cells.set(cellKey, raw);
    }

    sheet.set("updatedAt", now);
    getMetaMap(doc).set("updatedAt", now);
  });
}

export function replaceSheetColumns(
  doc: Doc,
  sheetId: string,
  nextColumns: SheetColumn[]
): void {
  const columns = getSheetColumnsMap(doc, sheetId);
  const columnWidths = getSheetColumnWidthsMap(doc, sheetId);
  const sheet = getSheetMap(doc, sheetId);
  if (!(columns && columnWidths && sheet)) {
    return;
  }

  const now = getNowIsoString();

  doc.transact(() => {
    for (const columnKey of [...columns.keys()]) {
      columns.delete(columnKey);
    }
    for (const columnKey of [...columnWidths.keys()]) {
      columnWidths.delete(columnKey);
    }

    for (const column of nextColumns) {
      const index = column.index;
      const columnName = column.name;
      const defaultName = getDefaultColumnName(index);
      if (columnName === defaultName) {
        // Skip storing default names.
      } else {
        columns.set(String(index), columnName);
      }

      if (column.width !== DEFAULT_SHEET_COLUMN_WIDTH) {
        columnWidths.set(String(index), column.width);
      }
    }

    sheet.set("updatedAt", now);
    getMetaMap(doc).set("updatedAt", now);
  });
}

export function replaceSheetRowHeights(
  doc: Doc,
  sheetId: string,
  nextRowHeights: Record<string, number>
): void {
  const rowHeights = getSheetRowHeightsMap(doc, sheetId);
  const sheet = getSheetMap(doc, sheetId);
  if (!(rowHeights && sheet)) {
    return;
  }

  const now = getNowIsoString();

  doc.transact(() => {
    for (const rowKey of [...rowHeights.keys()]) {
      rowHeights.delete(rowKey);
    }

    for (const [rowKey, height] of Object.entries(nextRowHeights)) {
      if (height === DEFAULT_SHEET_ROW_HEIGHT) {
        continue;
      }

      rowHeights.set(rowKey, height);
    }

    sheet.set("updatedAt", now);
    getMetaMap(doc).set("updatedAt", now);
  });
}

export function replaceSheetFormats(
  doc: Doc,
  sheetId: string,
  nextFormats: Record<string, CellFormat>
): void {
  const formats = getSheetFormatsMap(doc, sheetId);
  const sheet = getSheetMap(doc, sheetId);
  if (!(formats && sheet)) {
    return;
  }

  const now = getNowIsoString();

  doc.transact(() => {
    for (const cellKey of [...formats.keys()]) {
      formats.delete(cellKey);
    }

    for (const [cellKey, format] of Object.entries(nextFormats)) {
      const normalizedFormat = normalizeCellFormat(format);
      if (!normalizedFormat) {
        continue;
      }

      formats.set(cellKey, serializeCellFormat(normalizedFormat));
    }

    sheet.set("updatedAt", now);
    getMetaMap(doc).set("updatedAt", now);
  });
}

export function createSheetUndoManager(
  doc: Doc,
  sheetId: string | null
): UndoManager | null {
  if (!sheetId) {
    return null;
  }

  const cells = getSheetCellsMap(doc, sheetId);
  const columns = getSheetColumnsMap(doc, sheetId);
  const columnWidths = getSheetColumnWidthsMap(doc, sheetId);
  const formats = getSheetFormatsMap(doc, sheetId);
  const rowHeights = getSheetRowHeightsMap(doc, sheetId);
  if (!(cells && columns && columnWidths && formats && rowHeights)) {
    return null;
  }

  return new UndoManager([cells, columns, columnWidths, formats, rowHeights]);
}

export function getWorkbookMeta(doc: Doc): WorkbookMeta {
  const meta = getMetaMap(doc);

  return {
    createdAt: getStringValue(meta, "createdAt"),
    id: getStringValue(meta, "id"),
    isFavorite: getBooleanValue(meta, "isFavorite"),
    lastOpenedAt: getStringValue(meta, "lastOpenedAt"),
    name: getStringValue(meta, "name", DEFAULT_WORKBOOK_NAME),
    sharingAccessRole: getStringValue(
      meta,
      "sharingAccessRole",
      DEFAULT_SHARING_ACCESS_ROLE
    ) as CollaborationAccessRole,
    sharingEnabled: getBooleanValue(meta, "sharingEnabled"),
    updatedAt: getStringValue(meta, "updatedAt"),
  };
}

export function getActiveSheetId(doc: Doc): string | null {
  const activeSheetId = getStringValue(getMetaMap(doc), "activeSheetId");
  return activeSheetId || null;
}

export function getSheets(doc: Doc): SheetMeta[] {
  const sheets = getSheetsMap(doc);
  const orderedSheetIds = getSheetOrder(doc).toArray();

  return orderedSheetIds
    .map((sheetId) => {
      const sheet = sheets.get(sheetId);
      if (!sheet) {
        return null;
      }

      return {
        createdAt: getStringValue(sheet, "createdAt"),
        id: getStringValue(sheet, "id", sheetId),
        name: getStringValue(sheet, "name", "Untitled sheet"),
        updatedAt: getStringValue(sheet, "updatedAt"),
      } satisfies SheetMeta;
    })
    .filter((sheet): sheet is SheetMeta => sheet !== null);
}

export function getSheetCells(
  doc: Doc,
  sheetId: string | null
): Record<string, PersistedCellRecord> {
  if (!sheetId) {
    return {};
  }

  const cells = getSheetCellsMap(doc, sheetId);
  if (!cells) {
    return {};
  }

  const result: Record<string, PersistedCellRecord> = {};
  for (const [cellKey, raw] of cells.entries()) {
    result[cellKey] = { raw };
  }

  return result;
}

export function getWorkbookSnapshot(doc: Doc): WorkbookSnapshot {
  const workbook = getWorkbookMeta(doc);
  const activeSheetId = getActiveSheetId(doc);
  const activeSheetColumnCount = getSheetColumnCount(doc, activeSheetId);

  return {
    activeSheetCells: getSheetCells(doc, activeSheetId),
    activeSheetColumns: getSheetColumns(
      doc,
      activeSheetId,
      activeSheetColumnCount
    ),
    activeSheetFormats: getSheetFormats(doc, activeSheetId),
    activeSheetRowHeights: getSheetRowHeights(doc, activeSheetId),
    activeSheetId,
    sheets: getSheets(doc),
    workbook,
  };
}
