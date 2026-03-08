"use client";

import type { PersistedCellRecord } from "@papyrus/core/workbook-types";
import { type CellObject, read, utils, type WorkSheet, write } from "xlsx";
import { parseStoredCellId } from "@/web/features/spreadsheet/lib/spreadsheet-engine";

const BOOLEAN_FALSE_PATTERN = /^false$/i;
const BOOLEAN_TRUE_PATTERN = /^true$/i;
const DEFAULT_IMPORTED_SHEET_NAME = "Sheet1";
const INVALID_FILENAME_PATTERN = /[<>:"/\\|?*]/;
const LEADING_ZERO_NUMERIC_PATTERN = /^-?0\d+/;
const NUMERIC_VALUE_PATTERN = /^-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i;
const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface ImportedSheetData {
  name: string;
  rows: string[][];
}

export interface ImportedWorkbookData {
  name: string;
  sheets: ImportedSheetData[];
}

export interface WorkbookExportSheetData {
  cells: Record<string, PersistedCellRecord>;
  name: string;
}

function parseCsvImport(
  fileName: string,
  fileContents: ArrayBuffer
): ImportedSheetData {
  const workbook = read(fileContents, {
    cellDates: true,
    cellFormula: true,
    type: "array",
  });
  const [firstSheetName] = workbook.SheetNames;

  return {
    name: sanitizeFileName(
      getBaseFileName(fileName),
      DEFAULT_IMPORTED_SHEET_NAME
    ),
    rows: getWorksheetRows(
      firstSheetName ? workbook.Sheets[firstSheetName] : undefined
    ),
  };
}

function parseExcelImport(
  fileName: string,
  fileContents: ArrayBuffer
): ImportedWorkbookData {
  const workbook = read(fileContents, {
    cellDates: true,
    cellFormula: true,
    type: "array",
  });
  const importedSheets = workbook.SheetNames.map((sheetName, index) => ({
    name:
      sheetName.trim() ||
      `${DEFAULT_IMPORTED_SHEET_NAME}${Math.max(index + 1, 1)}`,
    rows: getWorksheetRows(workbook.Sheets[sheetName]),
  }));

  return {
    name: sanitizeFileName(getBaseFileName(fileName), "Imported workbook"),
    sheets:
      importedSheets.length > 0
        ? importedSheets
        : [{ name: DEFAULT_IMPORTED_SHEET_NAME, rows: [] }],
  };
}

function getBaseFileName(fileName: string): string {
  const trimmedFileName = fileName.trim();
  const extensionStartIndex = trimmedFileName.lastIndexOf(".");
  if (extensionStartIndex <= 0) {
    return trimmedFileName;
  }

  return trimmedFileName.slice(0, extensionStartIndex);
}

function sanitizeFileName(fileName: string, fallback: string): string {
  const sanitizedFileName = Array.from(fileName.trim(), (character) => {
    if (INVALID_FILENAME_PATTERN.test(character)) {
      return "-";
    }

    return character.charCodeAt(0) < 32 ? "-" : character;
  })
    .join("")
    .replace(/\s+/g, " ");

  return sanitizedFileName.length > 0 ? sanitizedFileName : fallback;
}

function trimTrailingEmptyCells(row: string[]): string[] {
  let lastNonEmptyIndex = -1;

  for (const [index, value] of row.entries()) {
    if (value !== "") {
      lastNonEmptyIndex = index;
    }
  }

  return lastNonEmptyIndex >= 0 ? row.slice(0, lastNonEmptyIndex + 1) : [];
}

function trimTrailingEmptyRows(rows: string[][]): string[][] {
  const trimmedRows = rows.map((row) => trimTrailingEmptyCells(row));
  let lastNonEmptyRowIndex = -1;

  for (const [index, row] of trimmedRows.entries()) {
    if (row.length > 0) {
      lastNonEmptyRowIndex = index;
    }
  }

  return lastNonEmptyRowIndex >= 0
    ? trimmedRows.slice(0, lastNonEmptyRowIndex + 1)
    : [];
}

function normalizeImportedCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function getImportedCellRaw(cell: CellObject): string {
  if (typeof cell.f === "string" && cell.f.length > 0) {
    return `=${cell.f}`;
  }

  if (typeof cell.w === "string" && cell.t === "d") {
    return cell.w;
  }

  return normalizeImportedCellValue(cell.v);
}

function getWorksheetRows(worksheet: WorkSheet | undefined): string[][] {
  const worksheetRange = worksheet?.["!ref"];
  if (!(worksheet && typeof worksheetRange === "string")) {
    return [];
  }

  const decodedRange = utils.decode_range(worksheetRange);
  const rowCount = decodedRange.e.r - decodedRange.s.r + 1;
  const columnCount = decodedRange.e.c - decodedRange.s.c + 1;
  const rows = Array.from({ length: rowCount }, () =>
    Array.from({ length: columnCount }, () => "")
  );

  for (
    let rowIndex = decodedRange.s.r;
    rowIndex <= decodedRange.e.r;
    rowIndex++
  ) {
    for (
      let columnIndex = decodedRange.s.c;
      columnIndex <= decodedRange.e.c;
      columnIndex++
    ) {
      const cellAddress = utils.encode_cell({ c: columnIndex, r: rowIndex });
      const cell = worksheet[cellAddress];
      if (!cell) {
        continue;
      }

      const row = rows[rowIndex - decodedRange.s.r];
      if (!row) {
        continue;
      }

      row[columnIndex - decodedRange.s.c] = getImportedCellRaw(cell);
    }
  }

  return trimTrailingEmptyRows(rows);
}

function buildMatrixFromCells(
  cells: Record<string, PersistedCellRecord>
): string[][] {
  let maxColumnIndex = -1;
  let maxRowIndex = -1;

  for (const [cellKey, cell] of Object.entries(cells)) {
    if (cell.raw === "") {
      continue;
    }

    const position = parseStoredCellId(cellKey);
    if (!position) {
      continue;
    }

    maxColumnIndex = Math.max(maxColumnIndex, position.col);
    maxRowIndex = Math.max(maxRowIndex, position.row);
  }

  if (maxColumnIndex < 0 || maxRowIndex < 0) {
    return [];
  }

  const rows = Array.from({ length: maxRowIndex + 1 }, () =>
    Array.from({ length: maxColumnIndex + 1 }, () => "")
  );

  for (const [cellKey, cell] of Object.entries(cells)) {
    const position = parseStoredCellId(cellKey);
    if (!position) {
      continue;
    }

    const row = rows[position.row];
    if (!row) {
      continue;
    }

    row[position.col] = cell.raw;
  }

  return trimTrailingEmptyRows(rows);
}

function escapeCsvCellValue(value: string): string {
  if (
    value.includes('"') ||
    value.includes(",") ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = downloadUrl;
  anchor.download = fileName;
  anchor.click();

  URL.revokeObjectURL(downloadUrl);
}

function shouldExportAsBoolean(raw: string): boolean {
  return BOOLEAN_TRUE_PATTERN.test(raw) || BOOLEAN_FALSE_PATTERN.test(raw);
}

function shouldExportAsNumber(raw: string): boolean {
  const trimmedRaw = raw.trim();
  if (trimmedRaw.length === 0 || trimmedRaw !== raw) {
    return false;
  }

  if (!NUMERIC_VALUE_PATTERN.test(trimmedRaw)) {
    return false;
  }

  if (
    LEADING_ZERO_NUMERIC_PATTERN.test(trimmedRaw) &&
    !trimmedRaw.startsWith("0.") &&
    !trimmedRaw.startsWith("-0.")
  ) {
    return false;
  }

  return Number.isFinite(Number(trimmedRaw));
}

function buildExcelCell(raw: string): CellObject {
  if (raw.startsWith("=") && raw.length > 1) {
    return { f: raw.slice(1), t: "n" };
  }

  if (shouldExportAsBoolean(raw)) {
    return { t: "b", v: BOOLEAN_TRUE_PATTERN.test(raw) };
  }

  if (shouldExportAsNumber(raw)) {
    return { t: "n", v: Number(raw) };
  }

  return { t: "s", v: raw };
}

function buildWorksheetFromCells(
  cells: Record<string, PersistedCellRecord>
): WorkSheet {
  const worksheet: WorkSheet = {};
  let maxColumnIndex = -1;
  let maxRowIndex = -1;

  for (const [cellKey, cell] of Object.entries(cells)) {
    if (cell.raw === "") {
      continue;
    }

    const position = parseStoredCellId(cellKey);
    if (!position) {
      continue;
    }

    worksheet[utils.encode_cell({ c: position.col, r: position.row })] =
      buildExcelCell(cell.raw);
    maxColumnIndex = Math.max(maxColumnIndex, position.col);
    maxRowIndex = Math.max(maxRowIndex, position.row);
  }

  worksheet["!ref"] =
    maxColumnIndex >= 0 && maxRowIndex >= 0
      ? utils.encode_range({
          e: { c: maxColumnIndex, r: maxRowIndex },
          s: { c: 0, r: 0 },
        })
      : "A1";

  return worksheet;
}

function getUniqueWorksheetName(
  requestedName: string,
  usedNames: Set<string>,
  fallbackIndex: number
): string {
  const baseName =
    requestedName.trim().slice(0, 31) ||
    `${DEFAULT_IMPORTED_SHEET_NAME}${fallbackIndex}`;

  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }

  let suffix = 2;
  while (suffix < 1000) {
    const nextName = `${baseName.slice(0, 31 - String(suffix).length - 1)} ${suffix}`;
    if (!usedNames.has(nextName)) {
      usedNames.add(nextName);
      return nextName;
    }

    suffix += 1;
  }

  usedNames.add(baseName);
  return baseName;
}

export { parseCsvImport, parseExcelImport };

export function exportCsvFile(
  workbookName: string,
  sheetName: string,
  cells: Record<string, PersistedCellRecord>
): void {
  const rows = buildMatrixFromCells(cells);
  const csvContents = rows
    .map((row) => row.map((value) => escapeCsvCellValue(value)).join(","))
    .join("\r\n");
  const fileName = sanitizeFileName(
    `${workbookName}-${sheetName}`,
    "papyrus-sheet"
  );

  downloadBlob(
    new Blob([csvContents], { type: "text/csv;charset=utf-8" }),
    `${fileName}.csv`
  );
}

export function exportExcelFile(
  workbookName: string,
  sheets: WorkbookExportSheetData[]
): void {
  const workbook = utils.book_new();
  const usedNames = new Set<string>();

  for (const [index, sheet] of sheets.entries()) {
    utils.book_append_sheet(
      workbook,
      buildWorksheetFromCells(sheet.cells),
      getUniqueWorksheetName(sheet.name, usedNames, index + 1)
    );
  }

  const workbookContents = write(workbook, {
    bookType: "xlsx",
    type: "array",
  });
  const fileName = sanitizeFileName(workbookName, "papyrus-workbook");

  downloadBlob(
    new Blob([workbookContents], { type: XLSX_MIME_TYPE }),
    `${fileName}.xlsx`
  );
}
