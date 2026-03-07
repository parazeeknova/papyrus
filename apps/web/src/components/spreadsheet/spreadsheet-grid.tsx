"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  type CellData,
  type CellPosition,
  cellId,
  colToLetter,
} from "@/web/hooks/use-spreadsheet";
import { cn } from "@/web/lib/utils";

const ROW_HEADER_WIDTH = 46;
const DEFAULT_COL_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 20;
const COL_HEADER_HEIGHT = 24;
const ROW_OVERSCAN = 30;

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

const CellComponent = memo(function CellComponent({
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
        "absolute inset-0 cursor-cell overflow-hidden text-ellipsis whitespace-nowrap bg-background px-1.5 text-left text-xs transition-none",
        isActive &&
          "z-5 border-2 border-primary bg-primary/5 shadow-[0_0_0_1px] shadow-primary/30"
      )}
      onDoubleClick={() => {
        onDoubleClick({ row, col });
      }}
      onKeyDown={(e) => {
        if (!(e.ctrlKey || e.metaKey || e.altKey) && e.key.length === 1) {
          e.preventDefault();
          onValueChange(row, col, e.key);
          onDoubleClick({ row, col });
        } else {
          onKeyDown(e);
        }
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect({ row, col });
      }}
      tabIndex={isActive ? 0 : -1}
      type="button"
    >
      {data.computed}
    </button>
  );
});

interface SpreadsheetGridProps {
  activeCell: CellPosition | null;
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const columnIndexes = useMemo(
    () => Array.from({ length: columnCount }, (_, index) => index),
    [columnCount]
  );

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

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => DEFAULT_ROW_HEIGHT,
    overscan: ROW_OVERSCAN,
    scrollPaddingStart: COL_HEADER_HEIGHT,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalColWidth = columnCount * DEFAULT_COL_WIDTH;
  const totalGridWidth = ROW_HEADER_WIDTH + totalColWidth;
  const totalRowHeight = rowVirtualizer.getTotalSize();
  const totalGridHeight = COL_HEADER_HEIGHT + totalRowHeight;

  useEffect(() => {
    if (activeCell) {
      rowVirtualizer.scrollToIndex(activeCell.row, { align: "auto" });
    }
  }, [activeCell, rowVirtualizer]);

  return (
    <div
      className="flex-1 overflow-auto bg-background"
      data-slot="spreadsheet-grid"
      ref={scrollRef}
    >
      <div
        className="relative"
        style={{ width: totalGridWidth, height: totalGridHeight }}
      >
        <div
          className="sticky top-0 z-30 flex"
          style={{ width: totalGridWidth, height: COL_HEADER_HEIGHT }}
        >
          <div
            className="sticky left-0 z-40 border-border border-r border-b bg-muted"
            style={{ width: ROW_HEADER_WIDTH, height: COL_HEADER_HEIGHT }}
          />
          {columnIndexes.map((col) => (
            <div
              className={cn(
                "flex shrink-0 select-none items-center justify-center border-border border-r border-b bg-muted font-medium text-muted-foreground text-xs",
                activeCell?.col === col &&
                  "bg-primary/10 font-semibold text-primary"
              )}
              key={`col-${col}`}
              style={{ width: DEFAULT_COL_WIDTH, height: COL_HEADER_HEIGHT }}
            >
              {colToLetter(col)}
            </div>
          ))}
        </div>

        {virtualRows.map((vr) => {
          const row = vr.index;

          return (
            <div
              className="absolute left-0 flex"
              key={`row-${row}`}
              style={{
                top: COL_HEADER_HEIGHT + vr.start,
                width: totalGridWidth,
                height: vr.size,
              }}
            >
              <div
                className={cn(
                  "sticky left-0 z-20 flex shrink-0 select-none items-center justify-center border-border border-r border-b bg-muted text-muted-foreground text-xs",
                  activeCell?.row === row &&
                    "bg-primary/10 font-semibold text-primary"
                )}
                style={{ width: ROW_HEADER_WIDTH, height: vr.size }}
              >
                {row + 1}
              </div>

              {columnIndexes.map((col) => {
                const id = cellId(row, col);
                const data = getCellData(row, col);
                const isActive =
                  activeCell?.row === row && activeCell?.col === col;
                const isEditing =
                  editingCell?.row === row && editingCell?.col === col;

                return (
                  <div
                    className="relative shrink-0 border-border border-r border-b bg-background p-0"
                    data-cell={id}
                    key={id}
                    style={{ width: DEFAULT_COL_WIDTH, height: vr.size }}
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
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
