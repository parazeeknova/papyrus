"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Button } from "@/web/components/ui/button";
import {
  type CellData,
  type CellPosition,
  cellId,
  colToLetter,
  type SelectionMode,
  type SelectionRange,
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
  isSelected: boolean;
  onCommit: () => void;
  onDoubleClick: (pos: CellPosition) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSelect: (
    pos: CellPosition,
    event: React.MouseEvent<HTMLButtonElement>
  ) => void;
  onSelectHover: (pos: CellPosition) => void;
  onValueChange: (row: number, col: number, value: string) => void;
  row: number;
}

const CellComponent = memo(function CellComponent({
  row,
  col,
  data,
  isActive,
  isEditing,
  isSelected,
  onSelect,
  onSelectHover,
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
        isSelected && "bg-primary/5",
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
        onSelect({ row, col }, e);
      }}
      onMouseEnter={() => {
        onSelectHover({ row, col });
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
  selection: SelectionRange | null;
  setCellValue: (row: number, col: number, value: string) => void;
  setSelectionRange: (
    start: CellPosition,
    end: CellPosition,
    mode?: SelectionMode
  ) => void;
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
  selection,
  setCellValue,
  selectCell,
  setSelectionRange,
  showAllRows,
  startEditing,
  stopEditing,
  navigateFromActive,
}: SpreadsheetGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectionDragRef = useRef<{
    mode: SelectionMode;
    start: CellPosition;
  } | null>(null);

  const normalizedSelection = useMemo(() => {
    if (!selection) {
      return null;
    }

    const minRow = Math.min(selection.start.row, selection.end.row);
    const maxRow = Math.max(selection.start.row, selection.end.row);
    const minCol = Math.min(selection.start.col, selection.end.col);
    const maxCol = Math.max(selection.start.col, selection.end.col);

    if (selection.mode === "rows") {
      return {
        mode: selection.mode,
        startRow: minRow,
        endRow: maxRow,
        startCol: 0,
        endCol: columnCount - 1,
      };
    }

    if (selection.mode === "columns") {
      return {
        mode: selection.mode,
        startRow: 0,
        endRow: rowCount - 1,
        startCol: minCol,
        endCol: maxCol,
      };
    }

    return {
      mode: selection.mode,
      startRow: minRow,
      endRow: maxRow,
      startCol: minCol,
      endCol: maxCol,
    };
  }, [selection, columnCount, rowCount]);

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

  useEffect(() => {
    const handleMouseUp = () => {
      selectionDragRef.current = null;
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const isCellSelected = useCallback(
    (row: number, col: number) => {
      if (!normalizedSelection) {
        return false;
      }

      return (
        row >= normalizedSelection.startRow &&
        row <= normalizedSelection.endRow &&
        col >= normalizedSelection.startCol &&
        col <= normalizedSelection.endCol
      );
    },
    [normalizedSelection]
  );

  const isRowHeaderSelected = useCallback(
    (row: number) => {
      if (!normalizedSelection) {
        return false;
      }

      return (
        row >= normalizedSelection.startRow && row <= normalizedSelection.endRow
      );
    },
    [normalizedSelection]
  );

  const isColumnHeaderSelected = useCallback(
    (col: number) => {
      if (!normalizedSelection) {
        return false;
      }

      return (
        col >= normalizedSelection.startCol && col <= normalizedSelection.endCol
      );
    },
    [normalizedSelection]
  );

  const beginSelectionDrag = useCallback(
    (start: CellPosition, mode: SelectionMode) => {
      selectionDragRef.current = { start, mode };
      setSelectionRange(start, start, mode);
    },
    [setSelectionRange]
  );

  const updateDraggedSelection = useCallback(
    (end: CellPosition) => {
      const dragState = selectionDragRef.current;
      if (!dragState) {
        return;
      }

      setSelectionRange(dragState.start, end, dragState.mode);
    },
    [setSelectionRange]
  );

  const handleCellSelect = useCallback(
    (pos: CellPosition, event: React.MouseEvent<HTMLButtonElement>) => {
      if (event.shiftKey && activeCell) {
        selectionDragRef.current = { start: activeCell, mode: "cells" };
        setSelectionRange(activeCell, pos, "cells");
        return;
      }

      selectionDragRef.current = { start: pos, mode: "cells" };
      selectCell(pos);
    },
    [activeCell, selectCell, setSelectionRange]
  );

  const visibleSelection = useMemo(() => {
    if (!(normalizedSelection && firstVirtualRow && firstVirtualCol)) {
      return null;
    }

    const visibleSelectionRows = virtualRows.filter(
      (row) =>
        row.index >= normalizedSelection.startRow &&
        row.index <= normalizedSelection.endRow
    );
    const visibleSelectionCols = virtualCols.filter(
      (col) =>
        col.index >= normalizedSelection.startCol &&
        col.index <= normalizedSelection.endCol
    );

    if (
      visibleSelectionRows.length === 0 ||
      visibleSelectionCols.length === 0
    ) {
      return null;
    }

    const startRow = visibleSelectionRows[0];
    const endRow = visibleSelectionRows.at(-1);
    const startCol = visibleSelectionCols[0];
    const endCol = visibleSelectionCols.at(-1);

    if (!(startRow && endRow && startCol && endCol)) {
      return null;
    }

    return {
      top: COL_HEADER_HEIGHT + startRow.start,
      left: ROW_HEADER_WIDTH + startCol.start,
      width: endCol.start + endCol.size - startCol.start,
      height: endRow.start + endRow.size - startRow.start,
    };
  }, [
    normalizedSelection,
    firstVirtualRow,
    firstVirtualCol,
    virtualRows,
    virtualCols,
  ]);

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
                <button
                  className={cn(
                    "absolute top-0 flex select-none items-center justify-center border-border border-r border-b bg-muted font-medium text-muted-foreground text-xs",
                    isColumnHeaderSelected(vc.index) &&
                      "z-10 bg-primary/12 font-semibold text-primary ring-1 ring-primary/30 ring-inset",
                    activeCell?.col === vc.index &&
                      "z-20 bg-primary/18 text-primary ring-1 ring-primary/50 ring-inset"
                  )}
                  key={`col-${vc.index}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    beginSelectionDrag({ row: 0, col: vc.index }, "columns");
                  }}
                  onMouseEnter={() => {
                    updateDraggedSelection({
                      row: rowCount - 1,
                      col: vc.index,
                    });
                  }}
                  style={{
                    left: vc.start - colOffset,
                    width: vc.size,
                    height: COL_HEADER_HEIGHT,
                  }}
                  type="button"
                >
                  {colToLetter(vc.index)}
                </button>
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
              <button
                className={cn(
                  "sticky left-0 z-20 flex select-none items-center justify-center border-border border-r border-b bg-muted text-muted-foreground text-xs",
                  isRowHeaderSelected(row) &&
                    "z-30 bg-primary/12 font-semibold text-primary ring-1 ring-primary/30 ring-inset",
                  activeCell?.row === row &&
                    "z-40 bg-primary/18 text-primary ring-1 ring-primary/50 ring-inset"
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  beginSelectionDrag({ row, col: 0 }, "rows");
                }}
                onMouseEnter={() => {
                  updateDraggedSelection({ row, col: columnCount - 1 });
                }}
                style={{ width: ROW_HEADER_WIDTH, height: vr.size }}
                type="button"
              >
                {row + 1}
              </button>

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
                    const isSelected = isCellSelected(row, col);

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
                          isSelected={isSelected}
                          onCommit={stopEditing}
                          onDoubleClick={startEditing}
                          onKeyDown={handleCellKeyDown}
                          onSelect={handleCellSelect}
                          onSelectHover={updateDraggedSelection}
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

        {visibleSelection ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute border-2 border-primary"
            style={{
              top: visibleSelection.top,
              left: visibleSelection.left,
              width: visibleSelection.width,
              height: visibleSelection.height,
            }}
          >
            <div className="absolute right-0 bottom-0 size-2 translate-x-1/2 translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_1px] shadow-background" />
          </div>
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
