"use client";

import type { CollaborationAccessRole } from "@papyrus/core/collaboration-types";
import { createWorkbookId } from "@papyrus/core/workbook-doc";
import type { SheetMeta } from "@papyrus/core/workbook-types";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { FormulaBar } from "@/web/features/workbook/editor/components/core/formula-bar";
import { SheetTabs } from "@/web/features/workbook/editor/components/core/sheet-tabs";
import { SpreadsheetGrid } from "@/web/features/workbook/editor/components/core/spreadsheet-grid";
import { Toolbar } from "@/web/features/workbook/editor/components/core/toolbar";
import { FindReplaceDialog } from "@/web/features/workbook/editor/components/dialogs/find-replace-dialog";
import { SpreadsheetMenuBar } from "@/web/features/workbook/editor/components/menu-bar/menu-bar";
import { useWorkbookEditor } from "@/web/features/workbook/editor/hooks/use-workbook-editor";
import { colToLetter } from "@/web/features/workbook/editor/lib/spreadsheet-engine";

const INITIAL_LOADING_SHEET: SheetMeta = {
  createdAt: "",
  id: "initial-loading-sheet",
  name: "Sheet1",
  updatedAt: "",
};
const BLANK_CELL = { raw: "", computed: "" };
const INTEGER_FORMATTER = new Intl.NumberFormat();
const DECIMAL_FORMATTER = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});
const MIN_VIEW_ZOOM_PERCENT = 50;
const MAX_VIEW_ZOOM_PERCENT = 200;
const VIEW_ZOOM_STEP_PERCENT = 10;

interface WorkbookPageClientProps {
  isSharedSession: boolean;
  requestedAccessRole?: CollaborationAccessRole | null;
  workbookId: string;
}

function WorkbookPageContent({
  isSharedSession,
  requestedAccessRole = null,
  workbookId,
}: WorkbookPageClientProps) {
  const router = useRouter();

  const {
    activeCell,
    activeSheetColumns,
    activeSelectionFormat,
    activeWorkbook,
    activeSheetId,
    activeSheetRowHeights,
    canEdit,
    canRedo,
    canSortSelection,
    canUndo,
    canExpandRows,
    canManualSync,
    canManageSharing,
    collaborationAccessRole,
    collaborationErrorMessage,
    collaborationPeers,
    collaborationStatus,
    copySelection,
    createSheet,
    cutSelection,
    deleteSelectedColumns,
    deleteSelectedRows,
    deleteSheet,
    deleteWorkbook,
    exportCsv,
    exportExcel,
    editingCell,
    editingDraft,
    columnCount,
    expandRowCount,
    findNext,
    hydrationState,
    importActiveSheetFromCsv,
    importErrorMessage,
    importFileName,
    importPhase,
    importWorkbookFromExcel,
    insertColumnLeft,
    insertColumnRight,
    insertRowAbove,
    insertRowBelow,
    lastSyncErrorMessage,
    lastSyncedLabel,
    operationStatusLabel,
    sheetLoadStatusLabel,
    pasteSelection,
    redo,
    reorderColumn,
    reorderRow,
    renameColumn,
    resizeColumn,
    resizeRow,
    renameWorkbook,
    remoteSyncStatus,
    remoteVersion,
    replaceAll,
    replaceCurrent,
    rowCount,
    saveState,
    setActiveSheet,
    setWorkbookFavorite,
    setWorkbookSharingAccessRole,
    setWorkbookSharingEnabled,
    sharingAccessRole,
    sharingEnabled,
    sheets,
    selection,
    setCellFontFamily,
    setCellFontSize,
    setSelectionRange,
    setCellTextColor,
    setCellTextTransform,
    sheetFooterSelectionSummary,
    sheetFooterSheetSummary,
    showAllRows,
    sortSelectionByActiveColumn,
    syncNow,
    getCellData,
    getCellFormat,
    getCellReferenceLabel,
    commitEditing,
    setCellValue,
    selectCell,
    sortSheetByColumn,
    startEditing,
    stopEditing,
    updateEditingValue,
    toggleCellFormat,
    undo,
    navigateFromActive,
    workbooks,
  } = useWorkbookEditor({
    isSharedSession,
    requestedAccessRole,
    workbookId,
  });

  const activeCellData = activeCell
    ? getCellData(activeCell.row, activeCell.col)
    : { raw: "", computed: "" };
  const isInitialLoad =
    hydrationState === "idle" || hydrationState === "loading";
  const isImporting =
    importPhase === "reading" ||
    importPhase === "parsing" ||
    importPhase === "applying";
  const importPhaseLabel =
    importPhase === "reading"
      ? "Reading file"
      : importPhase === "parsing"
        ? "Parsing workbook"
        : importPhase === "applying"
          ? "Applying workbook"
          : null;
  const loadingColumnNames = useMemo(() => {
    return Array.from({ length: columnCount }, (_unused, index) =>
      colToLetter(index)
    );
  }, [columnCount]);
  const activeSheetName = useMemo(() => {
    return sheets.find((sheet) => sheet.id === activeSheetId)?.name ?? null;
  }, [activeSheetId, sheets]);
  const gridLayoutKey = useMemo(() => {
    const columnLayoutSignature = activeSheetColumns
      .map((column) => `${column.index}:${column.name}:${column.width}`)
      .join("|");
    const rowLayoutSignature = Object.entries(activeSheetRowHeights)
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([rowIndex, height]) => `${rowIndex}:${height}`)
      .join("|");

    return `${activeSheetId ?? "none"}:${columnLayoutSignature}:${rowLayoutSignature}`;
  }, [activeSheetColumns, activeSheetId, activeSheetRowHeights]);
  const visibleSheets = isInitialLoad ? [INITIAL_LOADING_SHEET] : sheets;
  const visibleActiveSheetId = isInitialLoad
    ? INITIAL_LOADING_SHEET.id
    : activeSheetId;
  const getLoadingCellData = useCallback(() => BLANK_CELL, []);
  const navigateWhileLoading = useCallback(() => null, []);
  const transientStatusLabel =
    operationStatusLabel ?? importPhaseLabel ?? sheetLoadStatusLabel;
  const transientStatusDetail = importFileName ?? activeSheetName;
  const sheetFooterMetrics = useMemo(() => {
    if (isInitialLoad) {
      return [];
    }

    const metrics = [
      {
        label: "Rows",
        value: INTEGER_FORMATTER.format(sheetFooterSheetSummary.totalRowCount),
      },
      {
        label: "Cols",
        value: INTEGER_FORMATTER.format(
          sheetFooterSheetSummary.totalColumnCount
        ),
      },
      {
        label: "Filled",
        value: INTEGER_FORMATTER.format(
          sheetFooterSheetSummary.filledCellCount
        ),
      },
      {
        label: "Used rows",
        value: INTEGER_FORMATTER.format(
          sheetFooterSheetSummary.populatedRowCount
        ),
      },
      {
        label: "Used cols",
        value: INTEGER_FORMATTER.format(
          sheetFooterSheetSummary.populatedColumnCount
        ),
      },
    ];

    if (!sheetFooterSelectionSummary) {
      return metrics;
    }

    metrics.push({
      label: "Selected",
      value: INTEGER_FORMATTER.format(
        sheetFooterSelectionSummary.selectedCellCount
      ),
    });
    metrics.push({
      label: "In selection",
      value: INTEGER_FORMATTER.format(
        sheetFooterSelectionSummary.filledCellCount
      ),
    });

    if (sheetFooterSelectionSummary.numericCellCount > 0) {
      metrics.push({
        label: "Numeric",
        value: INTEGER_FORMATTER.format(
          sheetFooterSelectionSummary.numericCellCount
        ),
      });
      metrics.push({
        label: "Sum",
        value: DECIMAL_FORMATTER.format(sheetFooterSelectionSummary.sum ?? 0),
      });
      metrics.push({
        label: "Avg",
        value: DECIMAL_FORMATTER.format(
          sheetFooterSelectionSummary.average ?? 0
        ),
      });
    }

    return metrics;
  }, [isInitialLoad, sheetFooterSelectionSummary, sheetFooterSheetSummary]);

  const handleFormulaChange = useCallback(
    (value: string) => {
      if (activeCell) {
        const isEditingActiveCell =
          editingCell?.row === activeCell.row &&
          editingCell.col === activeCell.col;

        if (!isEditingActiveCell) {
          startEditing(activeCell);
        }

        updateEditingValue(value);
      }
    },
    [activeCell, editingCell, startEditing, updateEditingValue]
  );

  const handleFormulaCommit = useCallback(
    (direction: "down" | "up" = "down") => {
      commitEditing(direction).catch(() => undefined);
    },
    [commitEditing]
  );

  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);
  const [showFormulaBar, setShowFormulaBar] = useState(true);
  const [showGridlines, setShowGridlines] = useState(true);
  const [viewZoomPercent, setViewZoomPercent] = useState(100);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          event.target.tagName === "INPUT" ||
          event.target.tagName === "TEXTAREA" ||
          event.target.tagName === "SELECT")
      ) {
        return;
      }

      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }

      if (event.key.toLowerCase() === "h") {
        event.preventDefault();
        setIsFindReplaceOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background font-sans">
      <SpreadsheetMenuBar
        activeFontFamily={activeSelectionFormat?.fontFamily ?? null}
        activeFontSize={activeSelectionFormat?.fontSize ?? null}
        activeTextColor={activeSelectionFormat?.textColor ?? null}
        boldActive={activeSelectionFormat?.bold ?? false}
        canEdit={canEdit}
        canManageSharing={canManageSharing}
        canManualSync={canManualSync}
        canRedo={canRedo}
        canSortSelection={canSortSelection}
        canUndo={canUndo}
        collaborationAccessRole={collaborationAccessRole}
        collaborationErrorMessage={collaborationErrorMessage}
        collaborationPeers={collaborationPeers}
        collaborationStatus={collaborationStatus}
        isFavorite={activeWorkbook?.isFavorite ?? false}
        isGalleryOpen={isGalleryOpen}
        italicActive={activeSelectionFormat?.italic ?? false}
        lastSyncErrorMessage={lastSyncErrorMessage}
        lastSyncedLabel={lastSyncedLabel}
        onCopy={() => {
          copySelection().catch(() => undefined);
        }}
        onCreateWorkbook={() => {
          router.push(`/workbook/${createWorkbookId()}`);
        }}
        onCut={() => {
          cutSelection().catch(() => undefined);
        }}
        onDeleteColumn={() => {
          deleteSelectedColumns().catch(() => undefined);
        }}
        onDeleteRow={() => {
          deleteSelectedRows().catch(() => undefined);
        }}
        onDeleteWorkbook={() => {
          const shouldReturnHome = workbooks.length <= 1;

          deleteWorkbook()
            .then(() => {
              if (shouldReturnHome) {
                router.push("/");
              }
            })
            .catch(() => undefined);
        }}
        onExportCsv={() => {
          exportCsv().catch(() => undefined);
        }}
        onExportExcel={() => {
          exportExcel().catch(() => undefined);
        }}
        onImportCsv={(file) => {
          importActiveSheetFromCsv(file).catch(() => undefined);
        }}
        onImportExcel={(file) => {
          importWorkbookFromExcel(file).catch(() => undefined);
        }}
        onInsertColumnLeft={() => {
          insertColumnLeft().catch(() => undefined);
        }}
        onInsertColumnRight={() => {
          insertColumnRight().catch(() => undefined);
        }}
        onInsertRowAbove={() => {
          insertRowAbove().catch(() => undefined);
        }}
        onInsertRowBelow={() => {
          insertRowBelow().catch(() => undefined);
        }}
        onManualSync={() => {
          syncNow().catch(() => undefined);
        }}
        onOpenFindReplace={() => {
          setIsFindReplaceOpen(true);
        }}
        onOpenWorkbook={(nextWorkbookId) => {
          router.push(`/workbook/${nextWorkbookId}`);
        }}
        onPaste={() => {
          pasteSelection().catch(() => undefined);
        }}
        onRedo={() => {
          redo().catch(() => undefined);
        }}
        onRenameWorkbook={(name) => {
          renameWorkbook(name).catch(() => undefined);
        }}
        onSetFontFamily={(fontFamily) => {
          setCellFontFamily(fontFamily).catch(() => undefined);
        }}
        onSetFontSize={(fontSize) => {
          setCellFontSize(fontSize).catch(() => undefined);
        }}
        onSetTextColor={(textColor) => {
          setCellTextColor(textColor).catch(() => undefined);
        }}
        onSetTextTransform={(textTransform) => {
          setCellTextTransform(textTransform).catch(() => undefined);
        }}
        onSortSelectionAscending={() => {
          sortSelectionByActiveColumn("asc").catch(() => undefined);
        }}
        onSortSelectionDescending={() => {
          sortSelectionByActiveColumn("desc").catch(() => undefined);
        }}
        onToggleBold={() => {
          toggleCellFormat("bold").catch(() => undefined);
        }}
        onToggleFavorite={(isFavorite) => {
          setWorkbookFavorite(isFavorite).catch(() => undefined);
        }}
        onToggleFormulaBar={() => {
          setShowFormulaBar((prev) => !prev);
        }}
        onToggleGallery={() => {
          setIsGalleryOpen((prev) => !prev);
        }}
        onToggleGridlines={() => {
          setShowGridlines((prev) => !prev);
        }}
        onToggleItalic={() => {
          toggleCellFormat("italic").catch(() => undefined);
        }}
        onToggleStrikethrough={() => {
          toggleCellFormat("strikethrough").catch(() => undefined);
        }}
        onToggleUnderline={() => {
          toggleCellFormat("underline").catch(() => undefined);
        }}
        onUndo={() => {
          undo().catch(() => undefined);
        }}
        onUpdateSharingAccessRole={(accessRole) => {
          setWorkbookSharingAccessRole(accessRole).catch(() => undefined);
        }}
        onUpdateSharingEnabled={(nextSharingEnabled) => {
          setWorkbookSharingEnabled(nextSharingEnabled).catch(() => undefined);
        }}
        onZoomIn={() => {
          setViewZoomPercent((prev) =>
            Math.min(MAX_VIEW_ZOOM_PERCENT, prev + VIEW_ZOOM_STEP_PERCENT)
          );
        }}
        onZoomOut={() => {
          setViewZoomPercent((prev) =>
            Math.max(MIN_VIEW_ZOOM_PERCENT, prev - VIEW_ZOOM_STEP_PERCENT)
          );
        }}
        recentWorkbooks={workbooks}
        remoteSyncStatus={remoteSyncStatus}
        remoteVersion={remoteVersion}
        saveState={saveState}
        sharingAccessRole={sharingAccessRole}
        sharingEnabled={sharingEnabled}
        showFormulaBar={showFormulaBar}
        showGridlines={showGridlines}
        strikethroughActive={activeSelectionFormat?.strikethrough ?? false}
        syncServerUrl={null}
        textTransform={activeSelectionFormat?.textTransform ?? null}
        transientStatusDetail={transientStatusDetail}
        transientStatusLabel={transientStatusLabel}
        underlineActive={activeSelectionFormat?.underline ?? false}
        viewZoomPercent={viewZoomPercent}
        workbookId={activeWorkbook?.id ?? null}
        workbookName={activeWorkbook?.name ?? "Untitled spreadsheet"}
      />
      <Toolbar
        activeFontFamily={activeSelectionFormat?.fontFamily ?? null}
        activeFontSize={activeSelectionFormat?.fontSize ?? null}
        activeTextColor={activeSelectionFormat?.textColor ?? null}
        boldActive={activeSelectionFormat?.bold ?? false}
        canEdit={canEdit}
        canRedo={canRedo}
        canUndo={canUndo}
        italicActive={activeSelectionFormat?.italic ?? false}
        loading={isInitialLoad || isImporting}
        onCopy={() => {
          copySelection().catch(() => undefined);
        }}
        onCut={() => {
          cutSelection().catch(() => undefined);
        }}
        onDeleteColumn={() => {
          deleteSelectedColumns().catch(() => undefined);
        }}
        onDeleteRow={() => {
          deleteSelectedRows().catch(() => undefined);
        }}
        onOpenFindReplace={() => {
          setIsFindReplaceOpen(true);
        }}
        onPaste={() => {
          pasteSelection().catch(() => undefined);
        }}
        onRedo={() => {
          redo().catch(() => undefined);
        }}
        onSetFontFamily={(fontFamily) => {
          setCellFontFamily(fontFamily).catch(() => undefined);
        }}
        onSetFontSize={(fontSize) => {
          setCellFontSize(fontSize).catch(() => undefined);
        }}
        onSetTextColor={(textColor) => {
          setCellTextColor(textColor).catch(() => undefined);
        }}
        onSetTextTransform={(textTransform) => {
          setCellTextTransform(textTransform).catch(() => undefined);
        }}
        onToggleBold={() => {
          toggleCellFormat("bold").catch(() => undefined);
        }}
        onToggleItalic={() => {
          toggleCellFormat("italic").catch(() => undefined);
        }}
        onToggleStrikethrough={() => {
          toggleCellFormat("strikethrough").catch(() => undefined);
        }}
        onToggleUnderline={() => {
          toggleCellFormat("underline").catch(() => undefined);
        }}
        onUndo={() => {
          undo().catch(() => undefined);
        }}
        strikethroughActive={activeSelectionFormat?.strikethrough ?? false}
        textTransform={activeSelectionFormat?.textTransform ?? null}
        underlineActive={activeSelectionFormat?.underline ?? false}
      />
      {showFormulaBar ? (
        <FormulaBar
          activeCell={activeCell}
          cellRaw={
            editingCell?.row === activeCell?.row &&
            editingCell?.col === activeCell?.col
              ? editingDraft
              : activeCellData.raw
          }
          disabled={!canEdit || isInitialLoad || isImporting}
          getCellReferenceLabel={getCellReferenceLabel}
          onCancel={stopEditing}
          onCommit={handleFormulaCommit}
          onValueChange={handleFormulaChange}
          primaryColumnName={activeSheetColumns[0]?.name ?? "A"}
        />
      ) : null}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {importPhase === "error" && importErrorMessage ? (
          <div className="border-destructive/20 border-b bg-destructive/8 px-4 py-2 text-destructive text-sm">
            Failed to import
            {importFileName ? ` ${importFileName}` : " file"}:{" "}
            {importErrorMessage}
          </div>
        ) : null}
        <SpreadsheetGrid
          activeCell={isInitialLoad ? null : activeCell}
          canEdit={isInitialLoad ? false : canEdit}
          canExpandRows={isInitialLoad ? false : canExpandRows}
          canRedo={isInitialLoad ? false : canRedo}
          canUndo={isInitialLoad ? false : canUndo}
          collaborationPeers={isInitialLoad ? [] : collaborationPeers}
          columnCount={columnCount}
          columnNames={
            isInitialLoad
              ? loadingColumnNames
              : activeSheetColumns.map((column) => column.name)
          }
          columnWidths={activeSheetColumns.map((column) => column.width)}
          commitEditing={
            isInitialLoad
              ? () => undefined
              : (direction) => {
                  commitEditing(direction).catch(() => undefined);
                }
          }
          disabled={isInitialLoad || isImporting}
          editingCell={isInitialLoad ? null : editingCell}
          editingValue={isInitialLoad ? "" : editingDraft}
          expandRowCount={expandRowCount}
          getCellData={isInitialLoad ? getLoadingCellData : getCellData}
          getCellFormat={isInitialLoad ? () => ({}) : getCellFormat}
          key={gridLayoutKey}
          navigateFromActive={
            isInitialLoad ? navigateWhileLoading : navigateFromActive
          }
          onCopy={() => {
            copySelection().catch(() => undefined);
          }}
          onCut={() => {
            cutSelection().catch(() => undefined);
          }}
          onDeleteColumn={() => {
            deleteSelectedColumns().catch(() => undefined);
          }}
          onDeleteRow={() => {
            deleteSelectedRows().catch(() => undefined);
          }}
          onOpenFindReplace={() => {
            setIsFindReplaceOpen(true);
          }}
          onPaste={() => {
            pasteSelection().catch(() => undefined);
          }}
          onRedo={() => {
            redo().catch(() => undefined);
          }}
          onRenameColumn={(columnIndex, columnName) =>
            renameColumn(columnIndex, columnName)
          }
          onReorderColumn={(sourceColumnIndex, targetColumnIndex) => {
            reorderColumn(sourceColumnIndex, targetColumnIndex).catch(
              () => undefined
            );
          }}
          onReorderRow={(sourceRowIndex, targetRowIndex) => {
            reorderRow(sourceRowIndex, targetRowIndex).catch(() => undefined);
          }}
          onResizeColumn={(columnIndex, width) => {
            resizeColumn(columnIndex, width).catch(() => undefined);
          }}
          onResizeRow={(rowIndex, height) => {
            resizeRow(rowIndex, height).catch(() => undefined);
          }}
          onSortHeaderColumnAscending={(columnIndex) => {
            sortSheetByColumn(columnIndex, "asc").catch(() => undefined);
          }}
          onSortHeaderColumnDescending={(columnIndex) => {
            sortSheetByColumn(columnIndex, "desc").catch(() => undefined);
          }}
          onSortSelectionAscending={() => {
            sortSelectionByActiveColumn("asc").catch(() => undefined);
          }}
          onSortSelectionDescending={() => {
            sortSelectionByActiveColumn("desc").catch(() => undefined);
          }}
          onToggleBold={() => {
            toggleCellFormat("bold").catch(() => undefined);
          }}
          onToggleItalic={() => {
            toggleCellFormat("italic").catch(() => undefined);
          }}
          onToggleStrikethrough={() => {
            toggleCellFormat("strikethrough").catch(() => undefined);
          }}
          onToggleUnderline={() => {
            toggleCellFormat("underline").catch(() => undefined);
          }}
          onUndo={() => {
            undo().catch(() => undefined);
          }}
          rowCount={rowCount}
          rowHeights={isInitialLoad ? {} : activeSheetRowHeights}
          selectCell={isInitialLoad ? () => undefined : selectCell}
          selection={isInitialLoad ? null : selection}
          setCellValue={setCellValue}
          setSelectionRange={
            isInitialLoad ? () => undefined : setSelectionRange
          }
          sheetId={visibleActiveSheetId}
          showAllRows={showAllRows}
          showGridlines={showGridlines}
          startEditing={isInitialLoad ? () => undefined : startEditing}
          stopEditing={isInitialLoad ? () => undefined : stopEditing}
          updateEditingValue={
            isInitialLoad ? () => undefined : updateEditingValue
          }
          zoomScale={viewZoomPercent / 100}
        />
        <SheetTabs
          activeSheetId={visibleActiveSheetId}
          disableCreation={!canEdit}
          disableDeletion={!canEdit || visibleSheets.length <= 1}
          disabled={hydrationState !== "ready" || isImporting}
          footerMetrics={sheetFooterMetrics}
          onAddSheet={() => {
            createSheet().catch(() => undefined);
          }}
          onDeleteSheet={(sheetId) => {
            deleteSheet(sheetId).catch(() => undefined);
          }}
          onSelectSheet={(sheetId) => {
            setActiveSheet(sheetId).catch(() => undefined);
          }}
          sheets={visibleSheets}
        />
      </div>
      <FindReplaceDialog
        onFindNext={findNext}
        onOpenChange={setIsFindReplaceOpen}
        onReplace={replaceCurrent}
        onReplaceAll={replaceAll}
        open={isFindReplaceOpen}
      />
    </div>
  );
}

export function WorkbookPageClient(props: WorkbookPageClientProps) {
  return (
    <Suspense fallback={null}>
      <WorkbookPageContent {...props} />
    </Suspense>
  );
}
