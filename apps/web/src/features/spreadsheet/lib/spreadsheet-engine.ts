import type {
  CellData,
  CellPosition,
} from "@/web/features/spreadsheet/lib/spreadsheet-types";

const COLUMN_NAME_REGEX = /^[A-Za-z][A-Za-z0-9_]*$/;
const CELL_REF_REGEX = /^([A-Za-z][A-Za-z_]*)(\d+)$/;
const SUM_REGEX = /^SUM\((.+)\)$/i;
const AVERAGE_REGEX = /^AVERAGE\((.+)\)$/i;
const MIN_REGEX = /^MIN\((.+)\)$/i;
const MAX_REGEX = /^MAX\((.+)\)$/i;
const COUNT_REGEX = /^COUNT\((.+)\)$/i;
const SAFE_EXPRESSION_REGEX = /^[\d+\-*/().eE\s]+$/;
const CELL_REFERENCE_REGEX = /[A-Za-z][A-Za-z_]*\d+/g;
const CELL_RANGE_REGEX = /([A-Za-z][A-Za-z_]*\d+):([A-Za-z][A-Za-z_]*\d+)/g;
const RESERVED_COLUMN_NAMES = new Set([
  "AVERAGE",
  "COUNT",
  "MAX",
  "MIN",
  "SUM",
]);

export function colToLetter(col: number): string {
  let result = "";
  let c = col;
  while (c >= 0) {
    result = String.fromCharCode((c % 26) + 65) + result;
    c = Math.floor(c / 26) - 1;
  }
  return result;
}

export function cellId(row: number, col: number): string {
  return `C${col}R${row}`;
}

export function normalizeCellId(id: string): string {
  return id.trim().toUpperCase();
}

export function normalizeColumnName(name: string): string {
  return name.trim();
}

export function getColumnName(columnNames: string[], col: number): string {
  return columnNames[col] ?? colToLetter(col);
}

function getColumnNameLookup(columnNames: string[]): Map<string, number> {
  return new Map(
    columnNames.map((columnName, index) => [columnName.toUpperCase(), index])
  );
}

export function isValidColumnName(name: string): boolean {
  const normalizedName = normalizeColumnName(name);
  return (
    COLUMN_NAME_REGEX.test(normalizedName) &&
    !RESERVED_COLUMN_NAMES.has(normalizedName.toUpperCase())
  );
}

export function getCellReferenceLabel(
  row: number,
  col: number,
  columnNames: string[]
): string {
  return `${getColumnName(columnNames, col)}${row + 1}`;
}

export function getFormulaDependencies(
  raw: string,
  columnNames: string[]
): string[] {
  if (!raw.startsWith("=")) {
    return [];
  }

  const dependencyIds = new Set<string>();

  for (const match of raw.matchAll(CELL_RANGE_REGEX)) {
    const startRef = match[1];
    const endRef = match[2];
    if (!(startRef && endRef)) {
      continue;
    }

    const range = parseCellRange(`${startRef}:${endRef}`, columnNames);
    if (!range) {
      continue;
    }

    for (const position of getCellsInRange(range.start, range.end)) {
      dependencyIds.add(cellId(position.row, position.col));
    }
  }

  const singleReferences = raw.match(CELL_REFERENCE_REGEX);
  if (singleReferences) {
    for (const match of singleReferences) {
      const position = parseCellRef(match, columnNames);
      if (!position) {
        continue;
      }

      dependencyIds.add(cellId(position.row, position.col));
    }
  }

  return [...dependencyIds];
}

export function parseCellRef(
  ref: string,
  columnNames: string[]
): CellPosition | null {
  const match = CELL_REF_REGEX.exec(ref.trim());
  if (!(match?.[1] && match[2])) {
    return null;
  }

  const col = getColumnNameLookup(columnNames).get(match[1].toUpperCase());
  if (col === undefined) {
    return null;
  }

  return {
    col,
    row: Number.parseInt(match[2], 10) - 1,
  };
}

export function parseCellRange(
  rangeStr: string,
  columnNames: string[]
): { start: CellPosition; end: CellPosition } | null {
  const parts = rangeStr.split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  const start = parseCellRef(parts[0], columnNames);
  const end = parseCellRef(parts[1], columnNames);
  if (!(start && end)) {
    return null;
  }
  return { start, end };
}

export function getCellsInRange(
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

export function getCellValue(
  cells: Record<string, CellData>,
  id: string
): number {
  const cell = cells[id];
  if (!cell) {
    return 0;
  }
  const num = Number(cell.computed);
  return Number.isNaN(num) ? 0 : num;
}

export function evaluateFormula(
  formula: string,
  cells: Record<string, CellData>,
  columnNames: string[],
  visited: Set<string>
): string {
  const expressionBody = formula.slice(1).trim();

  // SUM function
  const sumMatch = SUM_REGEX.exec(expressionBody);
  if (sumMatch?.[1]) {
    const arg = sumMatch[1].trim();
    const range = parseCellRange(arg, columnNames);
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
  const avgMatch = AVERAGE_REGEX.exec(expressionBody);
  if (avgMatch?.[1]) {
    const arg = avgMatch[1].trim();
    const range = parseCellRange(arg, columnNames);
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
  const minMatch = MIN_REGEX.exec(expressionBody);
  if (minMatch?.[1]) {
    const arg = minMatch[1].trim();
    const range = parseCellRange(arg, columnNames);
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
  const maxMatch = MAX_REGEX.exec(expressionBody);
  if (maxMatch?.[1]) {
    const arg = maxMatch[1].trim();
    const range = parseCellRange(arg, columnNames);
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
  const countMatch = COUNT_REGEX.exec(expressionBody);
  if (countMatch?.[1]) {
    const arg = countMatch[1].trim();
    const range = parseCellRange(arg, columnNames);
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

  try {
    const expression = expressionBody.replace(CELL_REFERENCE_REGEX, (match) => {
      const position = parseCellRef(match, columnNames);
      if (!position) {
        return match;
      }

      const id = cellId(position.row, position.col);
      if (visited.has(id)) {
        return "NaN";
      }
      return String(getCellValue(cells, id));
    });

    if (!SAFE_EXPRESSION_REGEX.test(expression)) {
      return "#ERR!";
    }

    // biome-ignore lint/security/noGlobalEval: controlled environment
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
  columnNames: string[],
  currentId: string
): string {
  if (!raw) {
    return "";
  }
  if (!raw.startsWith("=")) {
    return raw;
  }
  const visited = new Set<string>([currentId]);
  return evaluateFormula(raw, cells, columnNames, visited);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function rewriteFormulaColumnName(
  raw: string,
  previousName: string,
  nextName: string
): string {
  if (!raw.startsWith("=")) {
    return raw;
  }

  const safePreviousName = escapeRegex(previousName);
  const referenceRegex = new RegExp(
    `(^|[^A-Za-z_])(${safePreviousName})(\\d+)`,
    "gi"
  );

  return raw.replace(referenceRegex, (_match, prefix, _name, rowNumber) => {
    return `${prefix}${nextName}${rowNumber}`;
  });
}
