"use client";

import type { CollaboratorPresence } from "@papyrus/core/collaboration-types";
import {
  type CellFormat,
  DEFAULT_SHEET_COLUMN_WIDTH,
  DEFAULT_SHEET_ROW_HEIGHT,
} from "@papyrus/core/workbook-types";
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
  type CSSProperties,
  memo,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
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
const COL_HEADER_HEIGHT = 24;
const ROW_OVERSCAN = 20;
const COL_OVERSCAN = 4;
const EXPANSION_PROMPT_HEIGHT = 56;
const INITIAL_VISIBLE_COL_COUNT = 12;
const INITIAL_VISIBLE_ROW_COUNT = 40;
const COLUMN_RESIZE_HANDLE_WIDTH = 8;
const ROW_RESIZE_HANDLE_HEIGHT = 8;
const MIN_COLUMN_WIDTH = 48;
const MIN_ROW_HEIGHT = 20;
const GRIP_DOT_KEYS = ["a", "b", "c", "d", "e", "f"] as const;

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

interface ResizeState {
  index: number;
  originPointerOffset: number;
  originSize: number;
  size: number;
  type: "column" | "row";
}

interface ReorderPreview {
  axis: "column" | "row";
  insertionIndex: number;
  sourceIndex: number;
}

interface NormalizedSelectionBounds {
  endCol: number;
  endRow: number;
  mode: SelectionMode;
  startCol: number;
  startRow: number;
}

interface CellComponentProps {
  canEdit: boolean;
  col: number;
  data: CellData;
  disabled?: boolean;
  editValue: string;
  format: CellFormat;
  isActive: boolean;
  isEditing: boolean;
  isSelected: boolean;
  onBeginTyping: (pos: CellPosition, value: string) => void;
  onCancel: () => void;
  onCommit: (direction?: "down" | "left" | "right" | "up") => void;
  onContextMenu: (
    pos: CellPosition,
    event: ReactMouseEvent<HTMLButtonElement>
  ) => void;
  onDoubleClick: (pos: CellPosition) => void;
  onEditValueChange: (value: string) => void;
  onKeyDown: (e: ReactKeyboardEvent) => void;
  onSelect: (
    pos: CellPosition,
    event: ReactMouseEvent<HTMLButtonElement>
  ) => void;
  onSelectHover: (pos: CellPosition) => void;
  row: number;
}

const CellComponent = memo(function CellComponent({
  canEdit,
  row,
  col,
  data,
  disabled = false,
  editValue,
  format,
  isActive,
  isEditing,
  isSelected,
  onBeginTyping,
  onCancel,
  onSelect,
  onSelectHover,
  onContextMenu,
  onDoubleClick,
  onEditValueChange,
  onCommit,
  onKeyDown,
}: CellComponentProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cellContentClassName = cn(
    "absolute inset-0 cursor-cell overflow-hidden text-ellipsis whitespace-nowrap bg-background px-1.5 text-left text-xs transition-none",
    format.bold && "font-bold",
    format.italic && "italic",
    format.strikethrough && "line-through",
    format.textTransform === "lowercase" && "lowercase",
    format.textTransform === "uppercase" && "uppercase",
    format.underline && "underline"
  );
  const cellContentStyle: CSSProperties | undefined = format.textColor
    ? {
        color: format.textColor,
        fontFamily: format.fontFamily,
        fontSize:
          typeof format.fontSize === "number"
            ? `${format.fontSize}px`
            : undefined,
      }
    : format.fontFamily || typeof format.fontSize === "number"
      ? {
          fontFamily: format.fontFamily,
          fontSize:
            typeof format.fontSize === "number"
              ? `${format.fontSize}px`
              : undefined,
        }
      : undefined;

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
        onBlur={() => {
          onCommit();
        }}
        onChange={(e) => {
          onEditValueChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit(e.shiftKey ? "up" : "down");
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          } else if (e.key === "Tab") {
            e.preventDefault();
            onCommit(e.shiftKey ? "left" : "right");
          }
        }}
        ref={inputRef}
        value={editValue}
      />
    );
  }

  return (
    <button
      className={cn(
        cellContentClassName,
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
          onBeginTyping({ row, col }, e.key);
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
      style={cellContentStyle}
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
  columnWidths: number[];
  commitEditing: (direction?: "down" | "left" | "right" | "up") => void;
  disabled?: boolean;
  editingCell: CellPosition | null;
  editingValue: string;
  expandRowCount: () => void;
  getCellData: (row: number, col: number) => CellData;
  getCellFormat: (row: number, col: number) => CellFormat;
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
  onReorderColumn: (
    sourceColumnIndex: number,
    targetColumnIndex: number
  ) => void;
  onReorderRow: (sourceRowIndex: number, targetRowIndex: number) => void;
  onResizeColumn: (columnIndex: number, width: number) => void;
  onResizeRow: (rowIndex: number, height: number) => void;
  onUndo: () => void;
  rowCount: number;
  rowHeights: Record<string, number>;
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
  startEditing: (pos: CellPosition, initialDraft?: string) => void;
  stopEditing: () => void;
  updateEditingValue: (value: string) => void;
}

function normalizeSelectionBounds(
  selection: {
    end: CellPosition;
    mode: SelectionMode;
    start: CellPosition;
  } | null,
  columnCount: number,
  rowCount: number
): NormalizedSelectionBounds | null {
  if (!selection) {
    return null;
  }

  const minRow = Math.min(selection.start.row, selection.end.row);
  const maxRow = Math.max(selection.start.row, selection.end.row);
  const minCol = Math.min(selection.start.col, selection.end.col);
  const maxCol = Math.max(selection.start.col, selection.end.col);

  if (selection.mode === "rows") {
    return {
      endCol: columnCount - 1,
      endRow: maxRow,
      mode: selection.mode,
      startCol: 0,
      startRow: minRow,
    };
  }

  if (selection.mode === "columns") {
    return {
      endCol: maxCol,
      endRow: rowCount - 1,
      mode: selection.mode,
      startCol: minCol,
      startRow: 0,
    };
  }

  return {
    endCol: maxCol,
    endRow: maxRow,
    mode: selection.mode,
    startCol: minCol,
    startRow: minRow,
  };
}

export function SpreadsheetGrid({
  activeCell,
  canEdit,
  canRedo,
  canUndo,
  canExpandRows,
  collaborationPeers,
  columnNames,
  columnWidths,
  disabled = false,
  editingCell,
  editingValue,
  columnCount,
  expandRowCount,
  rowCount,
  getCellData,
  getCellFormat,
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
  onReorderColumn,
  onReorderRow,
  onRenameColumn,
  onResizeColumn,
  onResizeRow,
  onRedo,
  onUndo,
  sheetId,
  rowHeights,
  commitEditing,
  updateEditingValue,
}: SpreadsheetGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const reorderDragRef = useRef<{
    axis: "column" | "row";
    sourceIndex: number;
  } | null>(null);
  const rowPointerReorderRef = useRef<{
    pointerId: number;
    sourceIndex: number;
  } | null>(null);
  const selectionDragRef = useRef<{
    mode: SelectionMode;
    start: CellPosition;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [reorderPreview, setReorderPreview] = useState<ReorderPreview | null>(
    null
  );
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [renamingColumnIndex, setRenamingColumnIndex] = useState<number | null>(
    null
  );
  const [columnNameDraft, setColumnNameDraft] = useState("");

  const normalizedSelection = useMemo(() => {
    return normalizeSelectionBounds(selection, columnCount, rowCount);
  }, [selection, columnCount, rowCount]);

  const getColumnWidth = useCallback(
    (columnIndex: number): number => {
      if (resizeState?.type === "column" && resizeState.index === columnIndex) {
        return resizeState.size;
      }

      return columnWidths[columnIndex] ?? DEFAULT_SHEET_COLUMN_WIDTH;
    },
    [columnWidths, resizeState]
  );

  const getRowHeight = useCallback(
    (rowIndex: number): number => {
      if (resizeState?.type === "row" && resizeState.index === rowIndex) {
        return resizeState.size;
      }

      return rowHeights[String(rowIndex)] ?? DEFAULT_SHEET_ROW_HEIGHT;
    },
    [resizeState, rowHeights]
  );

  const handleCellKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateFromActive("up");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        navigateFromActive("down");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateFromActive("left");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateFromActive("right");
      } else if (e.key === "Enter") {
        e.preventDefault();
        navigateFromActive(e.shiftKey ? "up" : "down");
      } else if (e.key === "Tab") {
        e.preventDefault();
        navigateFromActive(e.shiftKey ? "left" : "right");
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

  const handleCellEditCommit = useCallback(
    (direction?: "down" | "left" | "right" | "up") => {
      commitEditing(direction);
    },
    [commitEditing]
  );

  const moveIndex = useCallback(
    (index: number, fromIndex: number, toIndex: number): number => {
      if (fromIndex === toIndex) {
        return index;
      }

      if (index === fromIndex) {
        return toIndex;
      }

      if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
        return index - 1;
      }

      if (fromIndex > toIndex && index >= toIndex && index < fromIndex) {
        return index + 1;
      }

      return index;
    },
    []
  );

  const getDropTargetIndex = useCallback(
    (
      sourceIndex: number,
      insertionIndex: number,
      itemCount: number
    ): number | null => {
      const boundedInsertionIndex = Math.max(
        0,
        Math.min(itemCount, insertionIndex)
      );
      const targetIndex =
        boundedInsertionIndex > sourceIndex
          ? boundedInsertionIndex - 1
          : boundedInsertionIndex;

      if (targetIndex === sourceIndex || targetIndex >= itemCount) {
        return null;
      }

      return targetIndex;
    },
    []
  );

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: getRowHeight,
    overscan: ROW_OVERSCAN,
    scrollPaddingStart: COL_HEADER_HEIGHT,
  });

  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: columnCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: getColumnWidth,
    overscan: COL_OVERSCAN,
    scrollPaddingStart: ROW_HEADER_WIDTH,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualCols = colVirtualizer.getVirtualItems();
  const fallbackRows = useMemo<GridItem[]>(() => {
    let nextStart = 0;
    return Array.from(
      { length: Math.min(rowCount, INITIAL_VISIBLE_ROW_COUNT) },
      (_unused, index) => {
        const size = getRowHeight(index);
        const item = { index, size, start: nextStart };
        nextStart += size;
        return item;
      }
    );
  }, [getRowHeight, rowCount]);
  const fallbackCols = useMemo<GridItem[]>(() => {
    let nextStart = 0;
    return Array.from(
      { length: Math.min(columnCount, INITIAL_VISIBLE_COL_COUNT) },
      (_unused, index) => {
        const size = getColumnWidth(index);
        const item = { index, size, start: nextStart };
        nextStart += size;
        return item;
      }
    );
  }, [columnCount, getColumnWidth]);
  const rowSizingSignature = useMemo(() => {
    const persistedRowHeights = Object.entries(rowHeights)
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([rowIndex, height]) => `${rowIndex}:${height}`)
      .join("|");
    const rowResizePreview =
      resizeState?.type === "row"
        ? `${resizeState.index}:${resizeState.size}`
        : "";

    return `${rowCount}:${persistedRowHeights}:${rowResizePreview}`;
  }, [resizeState, rowCount, rowHeights]);
  const columnSizingSignature = useMemo(() => {
    const persistedColumnWidths = columnWidths.join("|");
    const columnResizePreview =
      resizeState?.type === "column"
        ? `${resizeState.index}:${resizeState.size}`
        : "";

    return `${columnCount}:${persistedColumnWidths}:${columnResizePreview}`;
  }, [columnCount, columnWidths, resizeState]);
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
  const resizeSessionKey = resizeState
    ? `${resizeState.type}:${resizeState.index}`
    : null;

  useEffect(() => {
    if (rowSizingSignature === "") {
      return;
    }

    rowVirtualizer.measure();
  }, [rowSizingSignature, rowVirtualizer]);

  useEffect(() => {
    if (columnSizingSignature === "") {
      return;
    }

    colVirtualizer.measure();
  }, [colVirtualizer, columnSizingSignature]);

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
        rowPointerReorderRef.current = null;
        reorderDragRef.current = null;
        setReorderPreview(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!resizeSessionKey) {
      return;
    }

    const activeResizeState = resizeStateRef.current;
    if (!activeResizeState) {
      return;
    }

    const nextCursor =
      activeResizeState.type === "column" ? "col-resize" : "row-resize";
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = nextCursor;

    const handlePointerMove = (event: PointerEvent) => {
      const currentState = resizeStateRef.current;
      if (!currentState) {
        return;
      }

      const pointerOffset =
        currentState.type === "column" ? event.clientX : event.clientY;
      const minimumSize =
        currentState.type === "column" ? MIN_COLUMN_WIDTH : MIN_ROW_HEIGHT;
      const nextSize = Math.max(
        minimumSize,
        currentState.originSize +
          (pointerOffset - currentState.originPointerOffset)
      );

      if (nextSize === currentState.size) {
        return;
      }

      resizeStateRef.current = {
        ...currentState,
        size: nextSize,
      };

      if (resizeFrameRef.current !== null) {
        return;
      }

      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        const pendingResizeState = resizeStateRef.current;
        if (pendingResizeState) {
          setResizeState(pendingResizeState);
        }
      });
    };

    const handlePointerUp = () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }

      const currentState = resizeStateRef.current;
      if (!currentState) {
        return;
      }

      if (currentState.size !== currentState.originSize) {
        if (currentState.type === "column") {
          onResizeColumn(currentState.index, currentState.size);
        } else {
          onResizeRow(currentState.index, currentState.size);
        }
      }

      resizeStateRef.current = null;
      setResizeState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }

      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [onResizeColumn, onResizeRow, resizeSessionKey]);

  const beginColumnResize = useCallback(
    (columnIndex: number, event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu(null);
      setRenamingColumnIndex(null);
      const nextResizeState = {
        index: columnIndex,
        originPointerOffset: event.clientX,
        originSize: getColumnWidth(columnIndex),
        size: getColumnWidth(columnIndex),
        type: "column",
      } satisfies ResizeState;
      resizeStateRef.current = nextResizeState;
      setResizeState(nextResizeState);
    },
    [getColumnWidth]
  );

  const beginRowResize = useCallback(
    (rowIndex: number, event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu(null);
      const nextResizeState = {
        index: rowIndex,
        originPointerOffset: event.clientY,
        originSize: getRowHeight(rowIndex),
        size: getRowHeight(rowIndex),
        type: "row",
      } satisfies ResizeState;
      resizeStateRef.current = nextResizeState;
      setResizeState(nextResizeState);
    },
    [getRowHeight]
  );

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
      if (reorderDragRef.current) {
        return;
      }

      const dragState = selectionDragRef.current;
      if (!dragState) {
        return;
      }

      setSelectionRange(dragState.start, end, dragState.mode);
    },
    [setSelectionRange]
  );

  const clearReorderDrag = useCallback(() => {
    rowPointerReorderRef.current = null;
    reorderDragRef.current = null;
    setReorderPreview(null);
  }, []);

  const updateRowPointerReorderPreview = useCallback(
    (clientY: number) => {
      const dragState = reorderDragRef.current;
      const scrollElement = scrollRef.current;
      const firstRow = renderRows[0];
      const lastRow = renderRows.at(-1);
      if (
        !(
          dragState &&
          dragState.axis === "row" &&
          scrollElement &&
          firstRow &&
          lastRow
        )
      ) {
        return;
      }

      const scrollBounds = scrollElement.getBoundingClientRect();
      const rowAreaY =
        clientY -
        scrollBounds.top +
        scrollElement.scrollTop -
        COL_HEADER_HEIGHT;

      let insertionIndex = firstRow.index;
      if (rowAreaY <= firstRow.start) {
        insertionIndex = firstRow.index;
      } else if (rowAreaY >= lastRow.start + lastRow.size) {
        insertionIndex = lastRow.index + 1;
      } else {
        insertionIndex = lastRow.index + 1;
        for (const row of renderRows) {
          if (rowAreaY < row.start + row.size / 2) {
            insertionIndex = row.index;
            break;
          }

          if (rowAreaY < row.start + row.size) {
            insertionIndex = row.index + 1;
            break;
          }
        }
      }

      setReorderPreview({
        axis: "row",
        insertionIndex: Math.max(0, Math.min(rowCount, insertionIndex)),
        sourceIndex: dragState.sourceIndex,
      });
    },
    [renderRows, rowCount]
  );

  const beginHeaderReorder = useCallback(
    (
      axis: "column" | "row",
      sourceIndex: number,
      event: ReactDragEvent<HTMLButtonElement>
    ) => {
      if (!(canEdit && !disabled)) {
        event.preventDefault();
        return;
      }

      selectionDragRef.current = null;
      setContextMenu(null);
      setRenamingColumnIndex(null);
      reorderDragRef.current = { axis, sourceIndex };
      setReorderPreview({
        axis,
        insertionIndex: sourceIndex,
        sourceIndex,
      });
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", `${axis}:${sourceIndex}`);
    },
    [canEdit, disabled]
  );

  const beginRowPointerReorder = useCallback(
    (sourceIndex: number, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!(canEdit && !disabled)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      selectionDragRef.current = null;
      setContextMenu(null);
      setRenamingColumnIndex(null);
      rowPointerReorderRef.current = {
        pointerId: event.pointerId,
        sourceIndex,
      };
      reorderDragRef.current = { axis: "row", sourceIndex };
      setReorderPreview({
        axis: "row",
        insertionIndex: sourceIndex,
        sourceIndex,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
      updateRowPointerReorderPreview(event.clientY);
    },
    [canEdit, disabled, updateRowPointerReorderPreview]
  );

  const updateHeaderReorderPreview = useCallback(
    (
      axis: "column" | "row",
      targetIndex: number,
      event: ReactDragEvent<HTMLButtonElement>
    ) => {
      const dragState = reorderDragRef.current;
      if (!dragState || dragState.axis !== axis) {
        return;
      }

      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      const pointerOffset =
        axis === "column"
          ? event.clientX - bounds.left
          : event.clientY - bounds.top;
      const size = axis === "column" ? bounds.width : bounds.height;
      const insertionIndex =
        pointerOffset < size / 2 ? targetIndex : targetIndex + 1;

      setReorderPreview({
        axis,
        insertionIndex,
        sourceIndex: dragState.sourceIndex,
      });
    },
    []
  );

  const commitHeaderReorder = useCallback(
    (axis: "column" | "row", insertionIndex: number) => {
      const dragState = reorderDragRef.current;
      if (!dragState || dragState.axis !== axis) {
        return;
      }

      const itemCount = axis === "column" ? columnCount : rowCount;
      const targetIndex = getDropTargetIndex(
        dragState.sourceIndex,
        insertionIndex,
        itemCount
      );

      if (targetIndex === null) {
        clearReorderDrag();
        return;
      }

      if (axis === "column") {
        onReorderColumn(dragState.sourceIndex, targetIndex);
        if (activeCell) {
          selectCell({
            col: moveIndex(activeCell.col, dragState.sourceIndex, targetIndex),
            row: activeCell.row,
          });
        }
        setSelectionRange(
          { col: targetIndex, row: 0 },
          { col: targetIndex, row: rowCount - 1 },
          "columns"
        );
      } else {
        onReorderRow(dragState.sourceIndex, targetIndex);
        if (activeCell) {
          selectCell({
            col: activeCell.col,
            row: moveIndex(activeCell.row, dragState.sourceIndex, targetIndex),
          });
        }
        setSelectionRange(
          { col: 0, row: targetIndex },
          { col: columnCount - 1, row: targetIndex },
          "rows"
        );
      }

      clearReorderDrag();
    },
    [
      activeCell,
      clearReorderDrag,
      columnCount,
      getDropTargetIndex,
      moveIndex,
      onReorderColumn,
      onReorderRow,
      rowCount,
      selectCell,
      setSelectionRange,
    ]
  );

  useEffect(() => {
    const activeRowPointerReorder = rowPointerReorderRef.current;
    if (!(activeRowPointerReorder && reorderPreview?.axis === "row")) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const handlePointerMove = (event: PointerEvent) => {
      if (rowPointerReorderRef.current?.pointerId !== event.pointerId) {
        return;
      }

      updateRowPointerReorderPreview(event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const currentRowPointerReorder = rowPointerReorderRef.current;
      if (
        !(
          currentRowPointerReorder &&
          currentRowPointerReorder.pointerId === event.pointerId
        )
      ) {
        return;
      }

      const insertionIndex =
        reorderPreview.axis === "row"
          ? reorderPreview.insertionIndex
          : currentRowPointerReorder.sourceIndex;
      commitHeaderReorder("row", insertionIndex);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (rowPointerReorderRef.current?.pointerId !== event.pointerId) {
        return;
      }

      clearReorderDrag();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [
    clearReorderDrag,
    commitHeaderReorder,
    reorderPreview,
    updateRowPointerReorderPreview,
  ]);

  const handleCellSelect = useCallback(
    (pos: CellPosition, event: ReactMouseEvent<HTMLButtonElement>) => {
      setContextMenu(null);
      if (editingCell) {
        commitEditing();
      }

      if (event.shiftKey && activeCell) {
        selectionDragRef.current = { start: activeCell, mode: "cells" };
        setSelectionRange(activeCell, pos, "cells");
        return;
      }

      selectionDragRef.current = { start: pos, mode: "cells" };
      selectCell(pos);
    },
    [activeCell, commitEditing, editingCell, selectCell, setSelectionRange]
  );

  const handleCellContextMenu = useCallback(
    (pos: CellPosition, event: ReactMouseEvent<HTMLButtonElement>) => {
      if (editingCell) {
        commitEditing();
      }

      selectCell(pos);
      setContextMenu({
        col: pos.col,
        row: pos.row,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [commitEditing, editingCell, selectCell]
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
    return collaborationPeers
      .map((peer) => {
        if (peer.sheetId !== sheetId) {
          return null;
        }

        const effectiveSelection =
          peer.selection ??
          (peer.activeCell
            ? {
                end: peer.activeCell,
                mode: "cells" as const,
                start: peer.activeCell,
              }
            : null);
        const normalizedPeerSelection = normalizeSelectionBounds(
          effectiveSelection,
          columnCount,
          rowCount
        );

        if (!normalizedPeerSelection) {
          return null;
        }

        const visibleSelectionRows = renderRows.filter(
          (row) =>
            row.index >= normalizedPeerSelection.startRow &&
            row.index <= normalizedPeerSelection.endRow
        );
        const visibleSelectionCols = renderCols.filter(
          (column) =>
            column.index >= normalizedPeerSelection.startCol &&
            column.index <= normalizedPeerSelection.endCol
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
          color: peer.identity.color,
          height: endRow.start + endRow.size - startRow.start,
          key: peer.identity.clientId,
          left: ROW_HEADER_WIDTH + startCol.start,
          name: peer.identity.name,
          top: COL_HEADER_HEIGHT + startRow.start,
          typingDraft:
            peer.typing?.sheetId === sheetId ? peer.typing.draft : null,
          width: endCol.start + endCol.size - startCol.start,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [
    collaborationPeers,
    columnCount,
    renderCols,
    renderRows,
    rowCount,
    sheetId,
  ]);

  const columnReorderIndicator = useMemo(() => {
    if (reorderPreview?.axis !== "column") {
      return null;
    }

    if (reorderPreview.insertionIndex === 0) {
      return ROW_HEADER_WIDTH;
    }

    if (reorderPreview.insertionIndex === columnCount) {
      const lastColumn = renderCols.at(-1);
      if (!(lastColumn && lastColumn.index === columnCount - 1)) {
        return null;
      }

      return ROW_HEADER_WIDTH + lastColumn.start + lastColumn.size;
    }

    const targetColumn = renderCols.find(
      (column) => column.index === reorderPreview.insertionIndex
    );
    if (!targetColumn) {
      return null;
    }

    return ROW_HEADER_WIDTH + targetColumn.start;
  }, [columnCount, renderCols, reorderPreview]);

  const rowReorderIndicator = useMemo(() => {
    if (reorderPreview?.axis !== "row") {
      return null;
    }

    if (reorderPreview.insertionIndex === 0) {
      return COL_HEADER_HEIGHT;
    }

    if (reorderPreview.insertionIndex === rowCount) {
      const lastRow = renderRows.at(-1);
      if (!(lastRow && lastRow.index === rowCount - 1)) {
        return null;
      }

      return COL_HEADER_HEIGHT + lastRow.start + lastRow.size;
    }

    const targetRow = renderRows.find(
      (row) => row.index === reorderPreview.insertionIndex
    );
    if (!targetRow) {
      return null;
    }

    return COL_HEADER_HEIGHT + targetRow.start;
  }, [renderRows, reorderPreview, rowCount]);

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
        {columnReorderIndicator !== null ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 z-50 w-0.5 bg-primary"
            style={{
              height: totalGridHeight,
              left: columnReorderIndicator,
            }}
          />
        ) : null}
        {rowReorderIndicator !== null ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-0 z-50 h-0.5 bg-primary"
            style={{
              top: rowReorderIndicator,
              width: totalGridWidth,
            }}
          />
        ) : null}

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
                      className={cn(headerClassName, "group")}
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
                  <div
                    className={cn(headerClassName, "group")}
                    key={`col-${vc.index}`}
                    style={headerStyle}
                  >
                    <button
                      className="flex h-full w-full items-center justify-center px-4"
                      disabled={disabled}
                      onDoubleClick={() => {
                        beginColumnRename(vc.index);
                      }}
                      onDragOver={(event) => {
                        updateHeaderReorderPreview("column", vc.index, event);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        commitHeaderReorder(
                          "column",
                          reorderPreview?.axis === "column"
                            ? reorderPreview.insertionIndex
                            : vc.index
                        );
                      }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        beginSelectionDrag(
                          { row: 0, col: vc.index },
                          "columns"
                        );
                      }}
                      onMouseEnter={() => {
                        updateDraggedSelection({
                          row: rowCount - 1,
                          col: vc.index,
                        });
                      }}
                      type="button"
                    >
                      {columnNames[vc.index]}
                    </button>
                    {canEdit && !disabled ? (
                      <button
                        aria-label={`Reorder column ${columnNames[vc.index]}`}
                        className="absolute top-1/2 left-1 z-20 flex h-4 w-3 -translate-y-1/2 cursor-grab items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-border/80 hover:text-foreground focus-visible:opacity-100 active:cursor-grabbing group-hover:opacity-100"
                        draggable
                        onDragEnd={clearReorderDrag}
                        onDragStart={(event) => {
                          beginHeaderReorder("column", vc.index, event);
                        }}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                        }}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className="grid grid-cols-2 gap-0.5"
                        >
                          {GRIP_DOT_KEYS.map((dotKey) => (
                            <span
                              className="size-0.5 rounded-full bg-current"
                              key={`col-grip-${vc.index}-${dotKey}`}
                            />
                          ))}
                        </span>
                      </button>
                    ) : null}
                    {canEdit && !disabled ? (
                      <button
                        aria-label={`Resize column ${columnNames[vc.index]}`}
                        className="absolute top-0 right-0 z-30 h-full cursor-col-resize touch-none bg-transparent transition-colors group-hover:bg-border/80"
                        onPointerDown={(event) => {
                          beginColumnResize(vc.index, event);
                        }}
                        style={{ width: COLUMN_RESIZE_HANDLE_WIDTH }}
                        type="button"
                      />
                    ) : null}
                  </div>
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
              <div
                className={cn(
                  "group sticky left-0 z-20 border-border border-r border-b bg-muted text-muted-foreground text-xs",
                  isRowHeaderSelected(row) &&
                    "z-30 bg-primary/12 font-semibold text-primary ring-1 ring-primary/30 ring-inset",
                  activeCell?.row === row &&
                    "z-40 bg-primary/18 text-primary ring-1 ring-primary/50 ring-inset"
                )}
                style={{ width: ROW_HEADER_WIDTH, height: vr.size }}
              >
                <button
                  className="flex h-full w-full select-none items-center justify-center py-2 pr-2 pl-4"
                  disabled={disabled}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    beginSelectionDrag({ row, col: 0 }, "rows");
                  }}
                  onMouseEnter={() => {
                    updateDraggedSelection({ row, col: columnCount - 1 });
                  }}
                  type="button"
                >
                  {row + 1}
                </button>
                {canEdit && !disabled ? (
                  <button
                    aria-label={`Reorder row ${row + 1}`}
                    className="absolute top-1/2 left-1 z-20 flex h-4 w-3 -translate-y-1/2 cursor-grab items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-border/80 hover:text-foreground focus-visible:opacity-100 active:cursor-grabbing group-hover:opacity-100"
                    onPointerDown={(event) => {
                      beginRowPointerReorder(row, event);
                    }}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className="grid grid-cols-2 gap-0.5"
                    >
                      {GRIP_DOT_KEYS.map((dotKey) => (
                        <span
                          className="size-0.5 rounded-full bg-current"
                          key={`row-grip-${row}-${dotKey}`}
                        />
                      ))}
                    </span>
                  </button>
                ) : null}
                {canEdit && !disabled ? (
                  <button
                    aria-label={`Resize row ${row + 1}`}
                    className="absolute bottom-0 left-0 z-30 w-full cursor-row-resize touch-none bg-transparent transition-colors hover:bg-border/80"
                    onPointerDown={(event) => {
                      beginRowResize(row, event);
                    }}
                    style={{ height: ROW_RESIZE_HANDLE_HEIGHT }}
                    type="button"
                  />
                ) : null}
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
                  {renderCols.map((vc) => {
                    const col = vc.index;
                    const id = cellId(row, col);
                    const data = getCellData(row, col);
                    const format = getCellFormat(row, col);
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
                          editValue={editingValue}
                          format={format}
                          isActive={isActive}
                          isEditing={isEditing}
                          isSelected={isSelected}
                          onBeginTyping={startEditing}
                          onCancel={stopEditing}
                          onCommit={handleCellEditCommit}
                          onContextMenu={handleCellContextMenu}
                          onDoubleClick={(position) => {
                            if (canEdit) {
                              startEditing(position);
                            }
                          }}
                          onEditValueChange={updateEditingValue}
                          onKeyDown={handleCellKeyDown}
                          onSelect={handleCellSelect}
                          onSelectHover={updateDraggedSelection}
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
