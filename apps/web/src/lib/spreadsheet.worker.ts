import type { CellData } from "@/web/hooks/use-spreadsheet";
import { cellId, computeCell } from "@/web/lib/spreadsheet-engine";

export type WorkerMessage =
  | { type: "INIT"; payload: Record<string, CellData> }
  | { type: "UPDATE_CELL"; payload: { row: number; col: number; raw: string } };

export interface WorkerResponse {
  payload: Record<string, CellData>;
  type: "STATE_UPDATE";
}

let cells: Record<string, CellData> = {};

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type === "INIT") {
    cells = e.data.payload;
  } else if (e.data.type === "UPDATE_CELL") {
    const { row, col, raw } = e.data.payload;
    const id = cellId(row, col);

    // Copy the cells record to mutate and compute
    const next = { ...cells };
    const computed = computeCell(raw, next, id);
    next[id] = { raw, computed };

    // Simple single-pass dependency recomputation
    for (const [key, cellData] of Object.entries(next)) {
      if (key !== id && cellData.raw.startsWith("=")) {
        next[key] = {
          raw: cellData.raw,
          computed: computeCell(cellData.raw, next, key),
        };
      }
    }

    cells = next;

    self.postMessage({
      type: "STATE_UPDATE",
      payload: cells,
    } satisfies WorkerResponse);
  }
};
