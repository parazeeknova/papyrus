import type { PersistedCellRecord } from "@papyrus/core/workbook-types";
import {
  cellId,
  computeCell,
  getFormulaDependencies,
  normalizeCellId,
} from "@/web/features/workbook/editor/lib/spreadsheet-engine";
import type {
  CellData,
  SpreadsheetPatch,
  SpreadsheetWorkerMessage,
  SpreadsheetWorkerResponse,
} from "@/web/features/workbook/editor/lib/spreadsheet-types";

let cells = new Map<string, CellData>();
let dependencies = new Map<string, Set<string>>();
let dependents = new Map<string, Set<string>>();
let columnNames: string[] = [];

type WorkerInitCellRecord = CellData | PersistedCellRecord;

const recomputeAll = (): SpreadsheetPatch => {
  const patch: SpreadsheetPatch = { deletions: [], updates: {} };
  const cellKeys = [...cells.keys()];

  if (cellKeys.length === 0) {
    return patch;
  }

  for (const _ of cellKeys) {
    let hasChanges = false;
    const snapshot = Object.fromEntries(cells);

    for (const cellKey of cellKeys) {
      const currentCell = cells.get(cellKey);
      if (!currentCell) {
        continue;
      }

      const nextComputed = computeCell(
        currentCell.raw,
        snapshot,
        columnNames,
        cellKey
      );
      const nextCell =
        nextComputed === currentCell.computed
          ? currentCell
          : { raw: currentCell.raw, computed: nextComputed };

      if (nextCell !== currentCell) {
        hasChanges = true;
      }

      upsertCell(cellKey, nextCell);
      patch.updates[cellKey] = nextCell;
    }

    if (!hasChanges) {
      break;
    }
  }

  return patch;
};

const removeDependencyEdges = (cellKey: string) => {
  const previousDependencies = dependencies.get(cellKey);
  if (!previousDependencies) {
    return;
  }

  for (const dependency of previousDependencies) {
    const dependencyDependents = dependents.get(dependency);
    if (!dependencyDependents) {
      continue;
    }

    dependencyDependents.delete(cellKey);
    if (dependencyDependents.size === 0) {
      dependents.delete(dependency);
    }
  }

  dependencies.delete(cellKey);
};

const setDependencyEdges = (cellKey: string, raw: string) => {
  const nextDependencies = new Set(getFormulaDependencies(raw, columnNames));
  if (nextDependencies.size === 0) {
    dependencies.delete(cellKey);
    return;
  }

  dependencies.set(cellKey, nextDependencies);
  for (const dependency of nextDependencies) {
    const dependencyDependents =
      dependents.get(dependency) ?? new Set<string>();
    dependencyDependents.add(cellKey);
    dependents.set(dependency, dependencyDependents);
  }
};

const upsertCell = (cellKey: string, value: CellData) => {
  if (value.raw === "" && value.computed === "") {
    cells.delete(cellKey);
    return;
  }

  cells.set(cellKey, value);
};

const recomputeFrom = (startKey: string): SpreadsheetPatch => {
  const queue = [startKey];
  const enqueued = new Set(queue);
  const patch: SpreadsheetPatch = { deletions: [], updates: {} };
  const snapshot = Object.fromEntries(cells);

  while (queue.length > 0) {
    const currentKey = queue.shift();
    if (!currentKey) {
      continue;
    }

    const currentCell = cells.get(currentKey);
    if (currentCell) {
      const nextComputed = computeCell(
        currentCell.raw,
        snapshot,
        columnNames,
        currentKey
      );
      const nextCell =
        nextComputed === currentCell.computed
          ? currentCell
          : { raw: currentCell.raw, computed: nextComputed };

      upsertCell(currentKey, nextCell);
      snapshot[currentKey] = nextCell;
      patch.updates[currentKey] = nextCell;
    } else if (!patch.deletions.includes(currentKey)) {
      patch.deletions.push(currentKey);
      delete snapshot[currentKey];
    }

    const nextDependents = dependents.get(currentKey);
    if (!nextDependents) {
      continue;
    }

    for (const dependentKey of nextDependents) {
      if (enqueued.has(dependentKey)) {
        continue;
      }

      queue.push(dependentKey);
      enqueued.add(dependentKey);
    }
  }

  return patch;
};

const resetState = (
  initialCells: Record<string, WorkerInitCellRecord>,
  nextColumnNames: string[]
) => {
  cells = new Map<string, CellData>();
  dependencies = new Map<string, Set<string>>();
  dependents = new Map<string, Set<string>>();
  columnNames = nextColumnNames;

  for (const [cellKey, cellData] of Object.entries(initialCells)) {
    const normalizedKey = normalizeCellId(cellKey);
    const normalizedCell: CellData = {
      computed:
        "computed" in cellData && typeof cellData.computed === "string"
          ? cellData.computed
          : cellData.raw,
      raw: cellData.raw,
    };
    upsertCell(normalizedKey, normalizedCell);
    setDependencyEdges(normalizedKey, normalizedCell.raw);
  }
};

const handleInit = (message: SpreadsheetWorkerMessage) => {
  if (message.type !== "INIT") {
    return;
  }

  resetState(message.payload.cells ?? {}, message.payload.columnNames ?? []);
  const patch = recomputeAll();
  self.postMessage({
    type: "READY",
    payload: {
      patch,
      requestId: message.payload.requestId,
    },
  } satisfies SpreadsheetWorkerResponse);
};

const handleUpdateCell = (message: SpreadsheetWorkerMessage) => {
  if (message.type !== "UPDATE_CELL") {
    return;
  }

  const { row, col, raw } = message.payload;
  const cellKey = normalizeCellId(cellId(row, col));

  removeDependencyEdges(cellKey);

  if (raw === "") {
    cells.delete(cellKey);
  } else {
    upsertCell(cellKey, {
      raw,
      computed: raw,
    });
    setDependencyEdges(cellKey, raw);
  }

  const patch = recomputeFrom(cellKey);
  if (raw === "") {
    delete patch.updates[cellKey];
    if (!patch.deletions.includes(cellKey)) {
      patch.deletions.push(cellKey);
    }
  }

  self.postMessage({
    type: "CELLS_PATCH",
    payload: { patch },
  } satisfies SpreadsheetWorkerResponse);
};

self.onmessage = (event: MessageEvent<SpreadsheetWorkerMessage>) => {
  if (event.data.type === "INIT") {
    handleInit(event.data);
    return;
  }

  handleUpdateCell(event.data);
};
