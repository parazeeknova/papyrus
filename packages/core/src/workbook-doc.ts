import { type Doc, UndoManager, type Array as YArray, Map as YMap } from "yjs";
import type { CollaborationAccessRole } from "./collaboration-types";
import type {
  PersistedCellRecord,
  SheetColumn,
  SheetMeta,
  WorkbookMeta,
  WorkbookSnapshot,
} from "./workbook-types";

const ROOT_META_KEY = "meta";
const ROOT_SHEETS_KEY = "sheets";
const ROOT_SHEET_ORDER_KEY = "sheetOrder";
const SHEET_CELLS_KEY = "cells";
const SHEET_COLUMNS_KEY = "columns";
const DEFAULT_WORKBOOK_NAME = "Untitled spreadsheet";
const DEFAULT_SHEET_NAME_PREFIX = "Sheet";
const DEFAULT_COLUMN_COUNT = 100;
const DEFAULT_SHARING_ACCESS_ROLE: CollaborationAccessRole = "viewer";

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

function ensureSheet(doc: Doc, sheetId: string, name: string): void {
  const sheets = getSheetsMap(doc);
  if (sheets.has(sheetId)) {
    return;
  }

  const now = getNowIsoString();
  const sheet = new YMap<unknown>();
  const cells = new YMap<string>();
  const columns = new YMap<string>();

  sheet.set("id", sheetId);
  sheet.set("name", name);
  sheet.set("createdAt", now);
  sheet.set("updatedAt", now);
  sheet.set(SHEET_CELLS_KEY, cells);
  sheet.set(SHEET_COLUMNS_KEY, columns);
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
    }));
  }

  const columns = getSheetColumnsMap(doc, sheetId);
  return Array.from({ length: columnCount }, (_, index) => ({
    index,
    name: columns?.get(String(index)) ?? getDefaultColumnName(index),
  }));
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
  columnNames: string[]
): void {
  const columns = getSheetColumnsMap(doc, sheetId);
  const sheet = getSheetMap(doc, sheetId);
  if (!(columns && sheet)) {
    return;
  }

  const now = getNowIsoString();

  doc.transact(() => {
    for (const columnKey of [...columns.keys()]) {
      columns.delete(columnKey);
    }

    for (const [index, columnName] of columnNames.entries()) {
      const defaultName = getDefaultColumnName(index);
      if (columnName === defaultName) {
        continue;
      }

      columns.set(String(index), columnName);
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
  if (!(cells && columns)) {
    return null;
  }

  return new UndoManager([cells, columns]);
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

  return {
    activeSheetCells: getSheetCells(doc, activeSheetId),
    activeSheetColumns: getSheetColumns(doc, activeSheetId),
    activeSheetId,
    sheets: getSheets(doc),
    workbook,
  };
}
