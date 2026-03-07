"use client";

import type { CollaboratorPresence } from "@papyrus/core/collaboration-types";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ClipboardTextIcon,
  ColumnsIcon,
  CopyIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  RowsIcon,
  ScissorsIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/web/components/ui/button";
import { Input } from "@/web/components/ui/input";
import {
  type CellData,
  type CellPosition,
  cellId,
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
const INITIAL_VISIBLE_COL_COUNT = 12;
const INITIAL_VISIBLE_ROW_COUNT = 40;

interface GridItem {
  index: number;
  size: number;
  start: number;
}

interface ContextMenuState {
  col: number;
  row: number;
  x: number;
  y: number;
}

interface CellComponentProps {
  canEdit: boolean;
  col: number;
  data: CellData;
  disabled?: boolean;
  isActive: boolean;
  isEditing: boolean;
  isSelected: boolean;
  onCommit: () => void;
  onContextMenu: (
    pos: CellPosition,
    event: ReactMouseEvent<HTMLButtonElement>
  ) => void;
  onDoubleClick: (pos: CellPosition) => void;
  onKeyDown: (e: ReactKeyboardEvent) => void;
  onSelect: (
    pos: CellPosition,
    event: ReactMouseEvent<HTMLButtonElement>
  ) => void;
  onSelectHover: (pos: CellPosition) => void;
  onValueChange: (row: number, col: number, value: string) => void;
  row: number;
}

const CellComponent = memo(function CellComponent({
  canEdit,
  row,
  col,
  data,
  disabled = false,
  isActive,
  isEditing,
  isSelected,
  onSelect,
  onSelectHover,
  onContextMenu,
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
        disabled={disabled}
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
      disabled={disabled}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu({ row, col }, event);
      }}
      onDoubleClick={() => {
        onDoubleClick({ row, col });
      }}
      onKeyDown={(e) => {
        if (
          canEdit &&
          !(e.ctrlKey || e.metaKey || e.altKey) &&
          e.key.length === 1
        ) {
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
  canEdit: boolean;
  canExpandRows: boolean;
  canRedo: boolean;
  canUndo: boolean;
  collaborationPeers: CollaboratorPresence[];
  columnCount: number;
  columnNames: string[];
  disabled?: boolean;
  editingCell: CellPosition | null;
  expandRowCount: () => void;
  getCellData: (row: number, col: number) => CellData;
  navigateFromActive: (
    direction: "up" | "down" | "left" | "right"
  ) => CellPosition | null;
  onCopy: () => void;
  onCut: () => void;
  onDeleteColumn: () => void;
  onDeleteRow: () => void;
  onOpenFindReplace: () => void;
  onPaste: () => void;
  onRedo: () => void;
  onRenameColumn: (columnIndex: number, columnName: string) => Promise<boolean>;
  onUndo: () => void;
  rowCount: number;
  selectCell: (pos: CellPosition | null) => void;
  selection: SelectionRange | null;
  setCellValue: (row: number, col: number, value: string) => void;
  setSelectionRange: (
    start: CellPosition,
    end: CellPosition,
    mode?: SelectionMode
  ) => void;
  sheetId: string | null;
  showAllRows: () => void;
  startEditing: (pos: CellPosition) => void;
  stopEditing: () => void;
}

export function SpreadsheetGrid({
  activeCell,
  canEdit,
  canRedo,
  canUndo,
  canExpandRows,
  collaborationPeers,
  columnNames,
  disabled = false,
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
  onCopy,
  onCut,
  onDeleteColumn,
  onDeleteRow,
  onOpenFindReplace,
  onPaste,
  onRenameColumn,
  onRedo,
  onUndo,
  sheetId,
}: SpreadsheetGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectionDragRef = useRef<{
    mode: SelectionMode;
    start: CellPosition;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingColumnIndex, setRenamingColumnIndex] = useState<number | null>(
    null
  );
  const [columnNameDraft, setColumnNameDraft] = useState("");

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
    (e: ReactKeyboardEvent) => {
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
        if (canEdit && activeCell) {
          e.preventDefault();
          setCellValue(activeCell.row, activeCell.col, "");
        }
      } else if (canEdit && e.key === "F2" && activeCell) {
        e.preventDefault();
        startEditing(activeCell);
      }
    },
    [activeCell, canEdit, navigateFromActive, setCellValue, startEditing]
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
  const fallbackRows = useMemo<GridItem[]>(
    () =>
      Array.from(
        { length: Math.min(rowCount, INITIAL_VISIBLE_ROW_COUNT) },
        (_unused, index) => ({
          index,
          size: DEFAULT_ROW_HEIGHT,
          start: index * DEFAULT_ROW_HEIGHT,
        })
      ),
    [rowCount]
  );
  const fallbackCols = useMemo<GridItem[]>(
    () =>
      Array.from(
        { length: Math.min(columnCount, INITIAL_VISIBLE_COL_COUNT) },
        (_unused, index) => ({
          index,
          size: DEFAULT_COL_WIDTH,
          start: index * DEFAULT_COL_WIDTH,
        })
      ),
    [columnCount]
  );
  const renderRows = virtualRows.length > 0 ? virtualRows : fallbackRows;
  const renderCols = virtualCols.length > 0 ? virtualCols : fallbackCols;
  const firstVirtualRow = renderRows[0];
  const firstVirtualCol = renderCols[0];
  const rowOffset = firstVirtualRow?.start ?? 0;
  const colOffset = firstVirtualCol?.start ?? 0;
  const visibleRowHeight = useMemo(
    () => renderRows.reduce((sum, row) => sum + row.size, 0),
    [renderRows]
  );
  const visibleColWidth = useMemo(
    () => renderCols.reduce((sum, col) => sum + col.size, 0),
    [renderCols]
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

  useEffect(() => {
    const handlePointerDown = () => {
      setContextMenu(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
        setRenamingColumnIndex(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
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
    (pos: CellPosition, event: ReactMouseEvent<HTMLButtonElement>) => {
      setContextMenu(null);
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

  const handleCellContextMenu = useCallback(
    (pos: CellPosition, event: ReactMouseEvent<HTMLButtonElement>) => {
      selectCell(pos);
      setContextMenu({
        col: pos.col,
        row: pos.row,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [selectCell]
  );

  const beginColumnRename = useCallback(
    (columnIndex: number) => {
      if (!canEdit) {
        return;
      }

      setContextMenu(null);
      setRenamingColumnIndex(columnIndex);
      setColumnNameDraft(columnNames[columnIndex] ?? "");
    },
    [canEdit, columnNames]
  );

  const commitColumnRename = useCallback(async () => {
    if (!canEdit || renamingColumnIndex === null) {
      return;
    }

    const didRename = await onRenameColumn(
      renamingColumnIndex,
      columnNameDraft
    );
    if (didRename) {
      setRenamingColumnIndex(null);
    }
  }, [canEdit, columnNameDraft, onRenameColumn, renamingColumnIndex]);

  const visibleSelection = useMemo(() => {
    if (
      !normalizedSelection ||
      virtualRows.length === 0 ||
      virtualCols.length === 0
    ) {
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
  }, [normalizedSelection, virtualRows, virtualCols]);

  const visiblePresence = useMemo(() => {
    const visibleRowsByIndex = new Map(
      renderRows.map((row) => [row.index, row])
    );
    const visibleColumnsByIndex = new Map(
      renderCols.map((column) => [column.index, column])
    );
    const presenceByCell = new Map<
      string,
      {
        col: number;
        peers: CollaboratorPresence[];
        row: number;
      }
    >();

    for (const peer of collaborationPeers) {
      if (!peer.activeCell) {
        continue;
      }

      const visibleRow = visibleRowsByIndex.get(peer.activeCell.row);
      const visibleColumn = visibleColumnsByIndex.get(peer.activeCell.col);
      if (!(visibleRow && visibleColumn)) {
        continue;
      }

      const presenceKey = `${peer.activeCell.row}:${peer.activeCell.col}`;
      const existingPresence = presenceByCell.get(presenceKey);

      if (existingPresence) {
        existingPresence.peers.push(peer);
        continue;
      }

      presenceByCell.set(presenceKey, {
        col: peer.activeCell.col,
        peers: [peer],
        row: peer.activeCell.row,
      });
    }

    return [...presenceByCell.values()]
      .map((presence) => {
        const row = visibleRowsByIndex.get(presence.row);
        const column = visibleColumnsByIndex.get(presence.col);
        const [primaryPeer] = presence.peers;

        if (!(row && column && primaryPeer)) {
          return null;
        }

        return {
          color: primaryPeer.identity.color,
          count: presence.peers.length,
          height: row.size,
          key: `${presence.row}:${presence.col}`,
          left: ROW_HEADER_WIDTH + column.start,
          name: primaryPeer.identity.name,
          typingDraft:
            presence.peers.find(
              (peer) =>
                peer.typing?.sheetId === sheetId &&
                peer.typing.cell.row === presence.row &&
                peer.typing.cell.col === presence.col
            )?.typing?.draft ?? null,
          top: COL_HEADER_HEIGHT + row.start,
          width: column.size,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [collaborationPeers, renderCols, renderRows, sheetId]);

  return (
    <div
      className={cn(
        "flex-1 overflow-auto bg-background",
        disabled && "pointer-events-none"
      )}
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
            className={cn(
              "sticky left-0 z-40 border-border border-r border-b bg-muted",
              normalizedSelection?.mode === "rows" &&
                "bg-primary/12 ring-1 ring-primary/30 ring-inset",
              normalizedSelection?.mode === "columns" &&
                "bg-primary/12 ring-1 ring-primary/30 ring-inset"
            )}
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
              {renderCols.map((vc) => {
                const headerClassName = cn(
                  "absolute top-0 flex select-none items-center justify-center border-border border-r border-b bg-muted font-medium text-muted-foreground text-xs",
                  isColumnHeaderSelected(vc.index) &&
                    "z-10 bg-primary/12 font-semibold text-primary ring-1 ring-primary/30 ring-inset",
                  activeCell?.col === vc.index &&
                    "z-20 bg-primary/18 text-primary ring-1 ring-primary/50 ring-inset"
                );
                const headerStyle = {
                  left: vc.start - colOffset,
                  width: vc.size,
                  height: COL_HEADER_HEIGHT,
                };

                if (renamingColumnIndex === vc.index) {
                  return (
                    <div
                      className={headerClassName}
                      key={`col-${vc.index}`}
                      style={headerStyle}
                    >
                      <Input
                        autoFocus
                        className="h-6 border-none bg-background px-1 text-center text-xs shadow-none focus-visible:ring-0"
                        onBlur={() => {
                          commitColumnRename().catch(() => undefined);
                        }}
                        onChange={(event) => {
                          setColumnNameDraft(event.target.value);
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitColumnRename().catch(() => undefined);
                          }

                          if (event.key === "Escape") {
                            event.preventDefault();
                            setRenamingColumnIndex(null);
                          }
                        }}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                        }}
                        value={columnNameDraft}
                      />
                    </div>
                  );
                }

                return (
                  <button
                    className={headerClassName}
                    disabled={disabled}
                    key={`col-${vc.index}`}
                    onDoubleClick={() => {
                      beginColumnRename(vc.index);
                    }}
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
                    style={headerStyle}
                    type="button"
                  >
                    {columnNames[vc.index]}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {renderRows.map((vr) => {
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
                disabled={disabled}
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
                  {renderCols.map((vc) => {
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
                          canEdit={canEdit}
                          col={col}
                          data={data}
                          disabled={disabled}
                          isActive={isActive}
                          isEditing={isEditing}
                          isSelected={isSelected}
                          onCommit={stopEditing}
                          onContextMenu={handleCellContextMenu}
                          onDoubleClick={(position) => {
                            if (canEdit) {
                              startEditing(position);
                            }
                          }}
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

        {visiblePresence.map((presence) => (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-20 border-2"
            key={presence.key}
            style={{
              borderColor: presence.color,
              height: presence.height,
              left: presence.left,
              top: presence.top,
              width: presence.width,
            }}
          >
            <div
              className="absolute top-0 left-0 -translate-y-[calc(100%+2px)] rounded-none px-1.5 py-0.5 font-medium text-[10px] text-white shadow-sm"
              style={{ backgroundColor: presence.color }}
            >
              {presence.name}
              {presence.typingDraft ? `: ${presence.typingDraft}` : ""}
              {presence.count > 1 ? ` +${presence.count - 1}` : ""}
            </div>
          </div>
        ))}

        {contextMenu ? (
          <div
            aria-label="Cell actions"
            className="fixed z-50 min-w-40 bg-[#30302E] p-0.5 text-[11px] text-white shadow-md ring-1 ring-white/10"
            onContextMenu={(event) => {
              event.preventDefault();
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            role="menu"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
            }}
          >
            <button
              className="flex h-7 w-full items-center gap-2 px-2 text-left text-white transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:text-white/40"
              disabled={!canUndo}
              onClick={() => {
                onUndo();
                setContextMenu(null);
              }}
              type="button"
            >
              <ArrowCounterClockwiseIcon className="size-3.5" weight="bold" />
              Undo
            </button>
            <button
              className="flex h-7 w-full items-center gap-2 px-2 text-left text-white transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:text-white/40"
              disabled={!canRedo}
              onClick={() => {
                onRedo();
                setContextMenu(null);
              }}
              type="button"
            >
              <ArrowClockwiseIcon className="size-3.5" weight="bold" />
              Redo
            </button>
            <div className="my-0.5 h-px bg-white/10" />
            <button
              className="flex h-7 w-full items-center gap-2 px-2 text-left text-white transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:text-white/40"
              disabled={!canEdit}
              onClick={() => {
                onCut();
                setContextMenu(null);
              }}
              type="button"
            >
              <ScissorsIcon className="size-3.5" weight="bold" />
              Cut
            </button>
            <button
              className="flex h-7 w-full items-center gap-2 px-2 text-left text-white transition-colors hover:bg-white/10"
              onClick={() => {
                onCopy();
                setContextMenu(null);
              }}
              type="button"
            >
              <CopyIcon className="size-3.5" weight="bold" />
              Copy
            </button>
            <button
              className="flex h-7 w-full items-center gap-2 px-2 text-left text-white transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:text-white/40"
              disabled={!canEdit}
              onClick={() => {
                onPaste();
                setContextMenu(null);
              }}
              type="button"
            >
              <ClipboardTextIcon className="size-3.5" weight="bold" />
              Paste
            </button>
            <div className="my-0.5 h-px bg-white/10" />
            <button
              className="flex h-7 w-full items-center gap-2 px-2 text-left text-white transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:text-white/40"
              disabled={!canEdit}
              onClick={() => {
                setCellValue(contextMenu.row, contextMenu.col, "");
                setContextMenu(null);
              }}
              type="button"
            >
              <TrashIcon className="size-3.5" weight="bold" />
              Delete contents
            </button>
            <button
              className="flex h-7 w-full items-center gap-2 px-2 text-left text-white transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:text-white/40"
              disabled={!canEdit}
              onClick={() => {
                beginColumnRename(contextMenu.col);
              }}
              type="button"
            >
              <PencilSimpleIcon className="size-3.5" weight="bold" />
              Rename column
            </button>
            <div className="my-0.5 h-px bg-white/10" />
            <button
              className="flex h-7 w-full items-center gap-2 px-2 text-left text-white transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:text-white/40"
              disabled={!canEdit}
              onClick={() => {
                onDeleteRow();
                setContextMenu(null);
              }}
              type="button"
            >
              <RowsIcon className="size-3.5" weight="bold" />
              Delete row
            </button>
            <button
              className="flex h-7 w-full items-center gap-2 px-2 text-left text-white transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:text-white/40"
              disabled={!canEdit}
              onClick={() => {
                onDeleteColumn();
                setContextMenu(null);
              }}
              type="button"
            >
              <ColumnsIcon className="size-3.5" weight="bold" />
              Delete column
            </button>
            <button
              className="flex h-7 w-full items-center gap-2 px-2 text-left text-white transition-colors hover:bg-white/10"
              onClick={() => {
                onOpenFindReplace();
                setContextMenu(null);
              }}
              type="button"
            >
              <MagnifyingGlassIcon className="size-3.5" weight="bold" />
              Find and replace
            </button>
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
