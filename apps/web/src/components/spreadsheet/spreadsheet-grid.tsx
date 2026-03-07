"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  type CellData,
  type CellPosition,
  cellId,
  colToLetter,
} from "@/web/hooks/use-spreadsheet";
import { cn } from "@/web/lib/utils";

const ROW_HEADER_WIDTH = 46;
const COL_HEADER_HEIGHT = 24;
const DEFAULT_COL_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 24;

interface CellComponentProps {
  col: number;
  data: CellData;
  isActive: boolean;
  isEditing: boolean;
  onCommit: () => void;
  onDoubleClick: (pos: CellPosition) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSelect: (pos: CellPosition) => void;
  onValueChange: (row: number, col: number, value: string) => void;
  row: number;
}

function CellComponent({
  row,
  col,
  data,
  isActive,
  isEditing,
  onSelect,
  onDoubleClick,
  onValueChange,
  onCommit,
  onKeyDown,
}: CellComponentProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const pos = { row, col };

  if (isEditing) {
    return (
      <input
        className="absolute inset-0 z-10 border-2 border-primary bg-background px-1.5 text-xs outline-none"
        onBlur={onCommit}
        onChange={(e) => {
          onValueChange(row, col, e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCommit();
          } else if (e.key === "Tab") {
            e.preventDefault();
            onCommit();
            onKeyDown(e);
          }
        }}
        ref={inputRef}
        value={data.raw}
      />
    );
  }

  return (
    <button
      className={cn(
        "absolute inset-0 cursor-cell overflow-hidden text-ellipsis whitespace-nowrap border-border border-r border-b bg-background px-1.5 text-left text-xs leading-5.5 transition-none",
        isActive &&
          "z-5 border-2 border-primary bg-primary/5 shadow-[0_0_0_1px] shadow-primary/30"
      )}
      onClick={() => {
        onSelect(pos);
      }}
      onDoubleClick={() => {
        onDoubleClick(pos);
      }}
      onKeyDown={(e) => {
        // Enter typing mode on printable keys
        if (!(e.ctrlKey || e.metaKey || e.altKey) && e.key.length === 1) {
          e.preventDefault();
          onValueChange(row, col, e.key);
          onDoubleClick(pos);
        } else {
          onKeyDown(e);
        }
      }}
      tabIndex={isActive ? 0 : -1}
      type="button"
    >
      {data.computed}
    </button>
  );
}

// --- Spreadsheet Grid ---

interface SpreadsheetGridProps {
  activeCell: CellPosition | null;
  cells: Record<string, CellData>;
  columnCount: number;
  editingCell: CellPosition | null;
  getCellData: (row: number, col: number) => CellData;
  navigateFromActive: (
    direction: "up" | "down" | "left" | "right"
  ) => CellPosition | null;
  rowCount: number;
  selectCell: (pos: CellPosition | null) => void;
  setCellValue: (row: number, col: number, value: string) => void;
  startEditing: (pos: CellPosition) => void;
  stopEditing: () => void;
}

export function SpreadsheetGrid({
  activeCell,
  editingCell,
  columnCount,
  rowCount,
  getCellData,
  setCellValue,
  selectCell,
  startEditing,
  stopEditing,
  navigateFromActive,
}: SpreadsheetGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateFromActive("up");
      } else if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        navigateFromActive("down");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateFromActive("left");
      } else if (e.key === "ArrowRight" || e.key === "Tab") {
        e.preventDefault();
        navigateFromActive("right");
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (activeCell) {
          e.preventDefault();
          setCellValue(activeCell.row, activeCell.col, "");
        }
      } else if (e.key === "F2" && activeCell) {
        e.preventDefault();
        startEditing(activeCell);
      }
    },
    [navigateFromActive, activeCell, setCellValue, startEditing]
  );

  // Scroll active cell into view
  useEffect(() => {
    if (!(activeCell && gridRef.current)) {
      return;
    }
    const cellElement = gridRef.current.querySelector(
      `[data-cell="${cellId(activeCell.row, activeCell.col)}"]`
    );
    if (cellElement) {
      cellElement.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeCell]);

  // Build columns array
  const columns = Array.from({ length: columnCount }, (_, i) => i);
  const rows = Array.from({ length: rowCount }, (_, i) => i);

  const totalWidth = ROW_HEADER_WIDTH + columnCount * DEFAULT_COL_WIDTH;
  const totalHeight = COL_HEADER_HEIGHT + rowCount * DEFAULT_ROW_HEIGHT;

  return (
    <div
      className="relative flex-1 overflow-auto bg-background"
      data-slot="spreadsheet-grid"
      ref={gridRef}
    >
      <div
        className="relative"
        style={{
          width: totalWidth,
          height: totalHeight,
        }}
      >
        {/* Corner header (top-left empty) */}
        <div
          className="sticky top-0 left-0 z-30 border-border border-r border-b bg-muted"
          style={{
            position: "sticky",
            width: ROW_HEADER_WIDTH,
            height: COL_HEADER_HEIGHT,
          }}
        />

        {/* Column headers */}
        <div
          className="sticky top-0 z-20"
          style={{
            position: "sticky",
            left: ROW_HEADER_WIDTH,
            height: COL_HEADER_HEIGHT,
            marginTop: -COL_HEADER_HEIGHT,
          }}
        >
          {columns.map((col) => (
            <div
              className={cn(
                "absolute flex select-none items-center justify-center border-border border-r border-b bg-muted font-medium text-muted-foreground text-xs",
                activeCell?.col === col &&
                  "bg-primary/10 font-semibold text-primary"
              )}
              key={col}
              style={{
                left: col * DEFAULT_COL_WIDTH,
                top: 0,
                width: DEFAULT_COL_WIDTH,
                height: COL_HEADER_HEIGHT,
              }}
            >
              {colToLetter(col)}
            </div>
          ))}
        </div>

        {/* Row headers */}
        <div
          className="sticky left-0 z-20"
          style={{
            position: "sticky",
            top: COL_HEADER_HEIGHT,
            width: ROW_HEADER_WIDTH,
          }}
        >
          {rows.map((row) => (
            <div
              className={cn(
                "absolute flex select-none items-center justify-center border-border border-r border-b bg-muted text-muted-foreground text-xs",
                activeCell?.row === row &&
                  "bg-primary/10 font-semibold text-primary"
              )}
              key={row}
              style={{
                left: 0,
                top: row * DEFAULT_ROW_HEIGHT,
                width: ROW_HEADER_WIDTH,
                height: DEFAULT_ROW_HEIGHT,
              }}
            >
              {row + 1}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div
          style={{
            position: "absolute",
            left: ROW_HEADER_WIDTH,
            top: COL_HEADER_HEIGHT,
          }}
        >
          {rows.map((row) =>
            columns.map((col) => {
              const id = cellId(row, col);
              const data = getCellData(row, col);
              const isActive =
                activeCell?.row === row && activeCell?.col === col;
              const isEditing =
                editingCell?.row === row && editingCell?.col === col;

              return (
                <div
                  data-cell={id}
                  key={id}
                  style={{
                    position: "absolute",
                    left: col * DEFAULT_COL_WIDTH,
                    top: row * DEFAULT_ROW_HEIGHT,
                    width: DEFAULT_COL_WIDTH,
                    height: DEFAULT_ROW_HEIGHT,
                  }}
                >
                  <CellComponent
                    col={col}
                    data={data}
                    isActive={isActive}
                    isEditing={isEditing}
                    onCommit={stopEditing}
                    onDoubleClick={startEditing}
                    onKeyDown={handleCellKeyDown}
                    onSelect={selectCell}
                    onValueChange={setCellValue}
                    row={row}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
