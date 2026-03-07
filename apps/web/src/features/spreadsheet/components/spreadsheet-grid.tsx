"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Button } from "@/web/components/ui/button";
import {
  type CellData,
  type CellPosition,
  cellId,
  colToLetter,
} from "@/web/features/spreadsheet/hooks/use-spreadsheet";
import { cn } from "@/web/lib/utils";

const ROW_HEADER_WIDTH = 46;
const DEFAULT_COL_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 20;
const COL_HEADER_HEIGHT = 24;
const ROW_OVERSCAN = 20;
const COL_OVERSCAN = 4;
const EXPANSION_PROMPT_HEIGHT = 56;

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
  canExpandRows: boolean;
  columnCount: number;
  editingCell: CellPosition | null;
  expandRowCount: () => void;
  getCellData: (row: number, col: number) => CellData;
  navigateFromActive: (
    direction: "up" | "down" | "left" | "right"
  ) => CellPosition | null;
  rowCount: number;
  selectCell: (pos: CellPosition | null) => void;
  setCellValue: (row: number, col: number, value: string) => void;
  showAllRows: () => void;
  startEditing: (pos: CellPosition) => void;
  stopEditing: () => void;
}

export function SpreadsheetGrid({
  activeCell,
  canExpandRows,
  editingCell,
  columnCount,
  expandRowCount,
  rowCount,
  getCellData,
  setCellValue,
  selectCell,
  showAllRows,
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
    overscan: ROW_OVERSCAN,
    scrollPaddingStart: COL_HEADER_HEIGHT,
  });

  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: columnCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => DEFAULT_COL_WIDTH,
    overscan: COL_OVERSCAN,
    scrollPaddingStart: ROW_HEADER_WIDTH,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualCols = colVirtualizer.getVirtualItems();
  const firstVirtualRow = virtualRows[0];
  const firstVirtualCol = virtualCols[0];
  const rowOffset = firstVirtualRow?.start ?? 0;
  const colOffset = firstVirtualCol?.start ?? 0;
  const visibleRowHeight = useMemo(
    () => virtualRows.reduce((sum, row) => sum + row.size, 0),
    [virtualRows]
  );
  const visibleColWidth = useMemo(
    () => virtualCols.reduce((sum, col) => sum + col.size, 0),
    [virtualCols]
  );

  const totalColWidth = colVirtualizer.getTotalSize();
  const totalGridWidth = ROW_HEADER_WIDTH + totalColWidth;
  const totalRowHeight = rowVirtualizer.getTotalSize();
  const totalGridHeight =
    COL_HEADER_HEIGHT +
    totalRowHeight +
    (canExpandRows ? EXPANSION_PROMPT_HEIGHT : 0);

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
        style={{ width: totalGridWidth, height: totalGridHeight }}
      >
        <div
          className="sticky top-0 z-30"
          style={{ width: totalGridWidth, height: COL_HEADER_HEIGHT }}
        >
          <div className="absolute inset-0 border-border border-b bg-muted" />
          <div
            className="sticky left-0 z-40 border-border border-r border-b bg-muted"
            style={{ width: ROW_HEADER_WIDTH, height: COL_HEADER_HEIGHT }}
          />
          {firstVirtualCol ? (
            <div
              className="absolute top-0"
              style={{
                left: ROW_HEADER_WIDTH + colOffset,
                width: visibleColWidth,
                height: COL_HEADER_HEIGHT,
              }}
            >
              {virtualCols.map((vc) => (
                <div
                  className={cn(
                    "absolute top-0 flex select-none items-center justify-center border-border border-r border-b bg-muted font-medium text-muted-foreground text-xs",
                    activeCell?.col === vc.index &&
                      "bg-primary/10 font-semibold text-primary"
                  )}
                  key={`col-${vc.index}`}
                  style={{
                    left: vc.start - colOffset,
                    width: vc.size,
                    height: COL_HEADER_HEIGHT,
                  }}
                >
                  {colToLetter(vc.index)}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {virtualRows.map((vr) => {
          const row = vr.index;

          return (
            <div
              className="absolute left-0"
              key={`row-${row}`}
              style={{
                top: COL_HEADER_HEIGHT + vr.start,
                width: totalGridWidth,
                height: vr.size,
              }}
            >
              <div
                className={cn(
                  "sticky left-0 z-20 flex select-none items-center justify-center border-border border-r border-b bg-muted text-muted-foreground text-xs",
                  activeCell?.row === row &&
                    "bg-primary/10 font-semibold text-primary"
                )}
                style={{ width: ROW_HEADER_WIDTH, height: vr.size }}
              >
                {row + 1}
              </div>

              {firstVirtualCol ? (
                <div
                  className="absolute top-0"
                  style={{
                    left: ROW_HEADER_WIDTH + colOffset,
                    width: visibleColWidth,
                    height: vr.size,
                  }}
                >
                  {virtualCols.map((vc) => {
                    const col = vc.index;
                    const id = cellId(row, col);
                    const data = getCellData(row, col);
                    const isActive =
                      activeCell?.row === row && activeCell?.col === col;
                    const isEditing =
                      editingCell?.row === row && editingCell?.col === col;

                    return (
                      <div
                        className="absolute border-border border-r border-b bg-background p-0"
                        data-cell={id}
                        key={id}
                        style={{
                          top: 0,
                          left: vc.start - colOffset,
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
                  })}
                </div>
              ) : null}
            </div>
          );
        })}

        {firstVirtualRow && firstVirtualCol ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute border-border border-r border-b"
            style={{
              top: COL_HEADER_HEIGHT + rowOffset,
              left: ROW_HEADER_WIDTH + colOffset,
              width: visibleColWidth,
              height: visibleRowHeight,
            }}
          />
        ) : null}

        {canExpandRows ? (
          <div
            className="absolute left-0 flex items-center justify-start border-border border-t bg-background/95 backdrop-blur-sm"
            style={{
              top: COL_HEADER_HEIGHT + totalRowHeight,
              width: totalGridWidth,
              height: EXPANSION_PROMPT_HEIGHT,
            }}
          >
            <div className="flex w-full max-w-xl items-center justify-between gap-3 border-border border-r bg-muted/60 px-4 py-2">
              <div>
                <p className="font-medium text-sm">
                  Showing first {rowCount.toLocaleString()} rows
                </p>
                <p className="text-muted-foreground text-xs">
                  Load more rows or expand to the full sheet.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={expandRowCount} size="sm" variant="outline">
                  +1,000 rows
                </Button>
                <Button onClick={showAllRows} size="sm" variant="ghost">
                  Show all
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
