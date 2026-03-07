"use client";

import { useCallback, useState } from "react";

export interface CellData {
  computed: string;
  raw: string;
}

export interface CellPosition {
  col: number;
  row: number;
}

export interface SelectionRange {
  end: CellPosition;
  start: CellPosition;
}

export interface SpreadsheetState {
  activeCell: CellPosition | null;
  cells: Record<string, CellData>;
  columnCount: number;
  editingCell: CellPosition | null;
  rowCount: number;
  selection: SelectionRange | null;
}

const CELL_REF_REGEX = /^([A-Z]+)(\d+)$/i;
const SUM_REGEX = /^SUM\((.+)\)$/i;
const AVERAGE_REGEX = /^AVERAGE\((.+)\)$/i;
const MIN_REGEX = /^MIN\((.+)\)$/i;
const MAX_REGEX = /^MAX\((.+)\)$/i;
const COUNT_REGEX = /^COUNT\((.+)\)$/i;
const SAFE_EXPRESSION_REGEX = /^[\d+\-*/().eE\s]+$/;

export function colToLetter(col: number): string {
  let result = "";
  let c = col;
  while (c >= 0) {
    result = String.fromCharCode((c % 26) + 65) + result;
    c = Math.floor(c / 26) - 1;
  }
  return result;
}

export function letterToCol(letter: string): number {
  let result = 0;
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.charCodeAt(i) - 64);
  }
  return result - 1;
}

export function cellId(row: number, col: number): string {
  return `${colToLetter(col)}${row + 1}`;
}

export function parseCellRef(ref: string): CellPosition | null {
  const match = CELL_REF_REGEX.exec(ref.trim());
  if (!(match?.[1] && match[2])) {
    return null;
  }
  return {
    col: letterToCol(match[1].toUpperCase()),
    row: Number.parseInt(match[2], 10) - 1,
  };
}

function parseCellRange(
  rangeStr: string
): { start: CellPosition; end: CellPosition } | null {
  const parts = rangeStr.split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  const start = parseCellRef(parts[0]);
  const end = parseCellRef(parts[1]);
  if (!(start && end)) {
    return null;
  }
  return { start, end };
}

function getCellsInRange(
  start: CellPosition,
  end: CellPosition
): CellPosition[] {
  const positions: CellPosition[] = [];
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const minCol = Math.min(start.col, end.col);
  const maxCol = Math.max(start.col, end.col);
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      positions.push({ row: r, col: c });
    }
  }
  return positions;
}

function getCellValue(cells: Record<string, CellData>, id: string): number {
  const cell = cells[id];
  if (!cell) {
    return 0;
  }
  const num = Number(cell.computed);
  return Number.isNaN(num) ? 0 : num;
}

function evaluateFormula(
  formula: string,
  cells: Record<string, CellData>,
  visited: Set<string>
): string {
  const upper = formula.slice(1).trim();

  // SUM function
  const sumMatch = SUM_REGEX.exec(upper);
  if (sumMatch?.[1]) {
    const arg = sumMatch[1].trim();
    const range = parseCellRange(arg);
    if (range) {
      const positions = getCellsInRange(range.start, range.end);
      let sum = 0;
      for (const pos of positions) {
        const id = cellId(pos.row, pos.col);
        if (visited.has(id)) {
          return "#CIRC!";
        }
        sum += getCellValue(cells, id);
      }
      return String(sum);
    }
    return "#REF!";
  }

  // AVERAGE function
  const avgMatch = AVERAGE_REGEX.exec(upper);
  if (avgMatch?.[1]) {
    const arg = avgMatch[1].trim();
    const range = parseCellRange(arg);
    if (range) {
      const positions = getCellsInRange(range.start, range.end);
      let sum = 0;
      for (const pos of positions) {
        const id = cellId(pos.row, pos.col);
        if (visited.has(id)) {
          return "#CIRC!";
        }
        sum += getCellValue(cells, id);
      }
      return positions.length > 0 ? String(sum / positions.length) : "0";
    }
    return "#REF!";
  }

  // MIN function
  const minMatch = MIN_REGEX.exec(upper);
  if (minMatch?.[1]) {
    const arg = minMatch[1].trim();
    const range = parseCellRange(arg);
    if (range) {
      const positions = getCellsInRange(range.start, range.end);
      const values = positions.map((pos) =>
        getCellValue(cells, cellId(pos.row, pos.col))
      );
      return values.length > 0 ? String(Math.min(...values)) : "0";
    }
    return "#REF!";
  }

  // MAX function
  const maxMatch = MAX_REGEX.exec(upper);
  if (maxMatch?.[1]) {
    const arg = maxMatch[1].trim();
    const range = parseCellRange(arg);
    if (range) {
      const positions = getCellsInRange(range.start, range.end);
      const values = positions.map((pos) =>
        getCellValue(cells, cellId(pos.row, pos.col))
      );
      return values.length > 0 ? String(Math.max(...values)) : "0";
    }
    return "#REF!";
  }

  // COUNT function
  const countMatch = COUNT_REGEX.exec(upper);
  if (countMatch?.[1]) {
    const arg = countMatch[1].trim();
    const range = parseCellRange(arg);
    if (range) {
      const positions = getCellsInRange(range.start, range.end);
      let count = 0;
      for (const pos of positions) {
        const id = cellId(pos.row, pos.col);
        const cell = cells[id];
        if (
          cell &&
          cell.computed !== "" &&
          !Number.isNaN(Number(cell.computed))
        ) {
          count++;
        }
      }
      return String(count);
    }
    return "#REF!";
  }

  // Arithmetic expression with cell references: =A1+B1*2
  try {
    const expression = upper.replace(/[A-Z]+\d+/gi, (match) => {
      const id = match.toUpperCase();
      if (visited.has(id)) {
        return "NaN";
      }
      return String(getCellValue(cells, id));
    });

    // Only allow safe characters: digits, operators, parens, dots, spaces
    if (!SAFE_EXPRESSION_REGEX.test(expression)) {
      return "#ERR!";
    }

    // biome-ignore lint/security/noGlobalEval: controlled arithmetic expression evaluation
    const result = eval(expression) as unknown;
    if (typeof result === "number" && Number.isFinite(result)) {
      return String(Math.round(result * 1e10) / 1e10);
    }
    return "#ERR!";
  } catch {
    return "#ERR!";
  }
}

export function computeCell(
  raw: string,
  cells: Record<string, CellData>,
  currentId: string
): string {
  if (!raw) {
    return "";
  }
  if (!raw.startsWith("=")) {
    return raw;
  }

  const visited = new Set<string>([currentId]);
  return evaluateFormula(raw, cells, visited);
}

const DEFAULT_COLS = 26;
const DEFAULT_ROWS = 100;

export function useSpreadsheet() {
  const [cells, setCells] = useState<Record<string, CellData>>({});
  const [activeCell, setActiveCell] = useState<CellPosition | null>(null);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [columnCount] = useState(DEFAULT_COLS);
  const [rowCount] = useState(DEFAULT_ROWS);

  const getCellData = useCallback(
    (row: number, col: number): CellData => {
      const id = cellId(row, col);
      return cells[id] ?? { raw: "", computed: "" };
    },
    [cells]
  );

  const setCellValue = useCallback((row: number, col: number, raw: string) => {
    setCells((prev) => {
      const id = cellId(row, col);
      const next = { ...prev };
      const computed = computeCell(raw, next, id);
      next[id] = { raw, computed };

      // Recompute dependent cells (simple single-pass for now)
      for (const [key, cellData] of Object.entries(next)) {
        if (key !== id && cellData.raw.startsWith("=")) {
          next[key] = {
            raw: cellData.raw,
            computed: computeCell(cellData.raw, next, key),
          };
        }
      }

      return next;
    });
  }, []);

  const selectCell = useCallback((pos: CellPosition | null) => {
    setActiveCell(pos);
    setSelection(pos ? { start: pos, end: pos } : null);
    setEditingCell(null);
  }, []);

  const startEditing = useCallback((pos: CellPosition) => {
    setActiveCell(pos);
    setEditingCell(pos);
  }, []);

  const stopEditing = useCallback(() => {
    setEditingCell(null);
  }, []);

  const navigateFromActive = useCallback(
    (direction: "up" | "down" | "left" | "right"): CellPosition | null => {
      if (!activeCell) {
        return null;
      }
      let { row, col } = activeCell;
      switch (direction) {
        case "up":
          row = Math.max(0, row - 1);
          break;
        case "down":
          row = Math.min(rowCount - 1, row + 1);
          break;
        case "left":
          col = Math.max(0, col - 1);
          break;
        case "right":
          col = Math.min(columnCount - 1, col + 1);
          break;
        default:
          break;
      }
      const newPos = { row, col };
      selectCell(newPos);
      return newPos;
    },
    [activeCell, rowCount, columnCount, selectCell]
  );

  return {
    cells,
    activeCell,
    editingCell,
    selection,
    columnCount,
    rowCount,
    getCellData,
    setCellValue,
    selectCell,
    startEditing,
    stopEditing,
    navigateFromActive,
  };
}
