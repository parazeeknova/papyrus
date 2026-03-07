"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useRef } from "react";
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
  const scrollRef = useRef<HTMLDivElement>(null);

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
    overscan: 10,
  });

  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: columnCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => DEFAULT_COL_WIDTH,
    overscan: 5,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualCols = colVirtualizer.getVirtualItems();

  const totalWidth = colVirtualizer.getTotalSize() + ROW_HEADER_WIDTH;
  const totalHeight = rowVirtualizer.getTotalSize() + COL_HEADER_HEIGHT;

  useEffect(() => {
    if (activeCell) {
      rowVirtualizer.scrollToIndex(activeCell.row, { align: "auto" });
      colVirtualizer.scrollToIndex(activeCell.col, { align: "auto" });
    }
  }, [activeCell, rowVirtualizer, colVirtualizer]);

  return (
    <div
      className="flex-1 overflow-auto bg-background"
      data-slot="spreadsheet-grid"
      ref={scrollRef}
    >
      <div
        className="relative"
        style={{
          width: totalWidth,
          height: totalHeight,
        }}
      >
        {/* Column header row — sticky to the top, scrolls horizontally with content */}
        <div
          className="sticky top-0 z-20"
          style={{ height: COL_HEADER_HEIGHT }}
        >
          {/* Corner cell — sticky to both top (via parent) and left */}
          <div
            className="sticky left-0 z-30 border-border border-r border-b bg-muted"
            style={{ width: ROW_HEADER_WIDTH, height: COL_HEADER_HEIGHT }}
          />
          {/* Column letter headers — absolutely positioned within the sticky row */}
          {virtualCols.map((vc) => (
            <div
              className={cn(
                "absolute top-0 flex select-none items-center justify-center border-border border-r border-b bg-muted font-medium text-muted-foreground text-xs",
                activeCell?.col === vc.index &&
                  "bg-primary/10 font-semibold text-primary"
              )}
              key={`col-${vc.index}`}
              style={{
                left: vc.start + ROW_HEADER_WIDTH,
                width: vc.size,
                height: COL_HEADER_HEIGHT,
              }}
            >
              {colToLetter(vc.index)}
            </div>
          ))}
        </div>

        {/*
         * Row header left panel — a single sticky element that scrolls vertically
         * with the content and sticks to the left during horizontal scroll.
         * Row number divs inside are plain absolute — no per-row sticky, no blink.
         */}
        <div
          className="sticky left-0 z-10"
          style={{
            width: ROW_HEADER_WIDTH,
            height: totalHeight - COL_HEADER_HEIGHT,
          }}
        >
          {virtualRows.map((vr) => (
            <div
              className={cn(
                "absolute flex select-none items-center justify-center border-border border-r border-b bg-muted text-muted-foreground text-xs",
                activeCell?.row === vr.index &&
                  "bg-primary/10 font-semibold text-primary"
              )}
              key={`row-${vr.index}`}
              style={{
                top: vr.start,
                width: ROW_HEADER_WIDTH,
                height: vr.size,
              }}
            >
              {vr.index + 1}
            </div>
          ))}
        </div>

        {/* Cells — absolutely positioned in the inner div */}
        {virtualRows.map((vr) =>
          virtualCols.map((vc) => {
            const row = vr.index;
            const col = vc.index;
            const id = cellId(row, col);
            const data = getCellData(row, col);
            const isActive = activeCell?.row === row && activeCell?.col === col;
            const isEditing =
              editingCell?.row === row && editingCell?.col === col;

            return (
              <div
                className="absolute border-border border-r border-b p-0"
                data-cell={id}
                key={id}
                style={{
                  top: vr.start + COL_HEADER_HEIGHT,
                  left: vc.start + ROW_HEADER_WIDTH,
                  width: vc.size,
                  height: vr.size,
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
  );
}
