"use client";

import { useCallback, useEffect, useState } from "react";
import { FormulaBar } from "@/web/features/spreadsheet/components/core/formula-bar";
import { SheetTabs } from "@/web/features/spreadsheet/components/core/sheet-tabs";
import { SpreadsheetGrid } from "@/web/features/spreadsheet/components/core/spreadsheet-grid";
import { Toolbar } from "@/web/features/spreadsheet/components/core/toolbar";
import { FindReplaceDialog } from "@/web/features/spreadsheet/components/dialogs/find-replace-dialog";
import { SpreadsheetMenuBar } from "@/web/features/spreadsheet/components/menu-bar/menu-bar";
import { TemplateGalleryPanel } from "@/web/features/spreadsheet/components/template-gallery";
import { useSpreadsheet } from "@/web/features/spreadsheet/hooks/use-spreadsheet";

export default function Home() {
  const {
    activeCell,
    activeSheetColumns,
    activeWorkbook,
    activeSheetId,
    canRedo,
    canUndo,
    canExpandRows,
    canManualSync,
    copySelection,
    createSheet,
    createWorkbook,
    cutSelection,
    deleteSelectedColumns,
    deleteSelectedRows,
    deleteWorkbook,
    editingCell,
    columnCount,
    expandRowCount,
    findNext,
    hydrationState,
    openWorkbook,
    pasteSelection,
    redo,
    renameColumn,
    renameWorkbook,
    replaceAll,
    replaceCurrent,
    rowCount,
    saveState,
    setActiveSheet,
    setWorkbookFavorite,
    sheets,
    selection,
    setSelectionRange,
    showAllRows,
    syncNow,
    getCellData,
    getCellReferenceLabel,
    setCellValue,
    selectCell,
    startEditing,
    stopEditing,
    undo,
    navigateFromActive,
    workbooks,
  } = useSpreadsheet();

  // Formula bar bindings
  const activeCellData = activeCell
    ? getCellData(activeCell.row, activeCell.col)
    : { raw: "", computed: "" };

  const handleFormulaChange = useCallback(
    (value: string) => {
      if (activeCell) {
        setCellValue(activeCell.row, activeCell.col, value);
      }
    },
    [activeCell, setCellValue]
  );

  const handleFormulaCommit = useCallback(() => {
    stopEditing();
    if (activeCell) {
      navigateFromActive("down");
    }
  }, [stopEditing, activeCell, navigateFromActive]);

  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);

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
        canManualSync={canManualSync}
        canRedo={canRedo}
        canUndo={canUndo}
        isFavorite={activeWorkbook?.isFavorite ?? false}
        isGalleryOpen={isGalleryOpen}
        onCopy={() => {
          copySelection().catch(() => undefined);
        }}
        onCreateWorkbook={() => {
          createWorkbook().catch(() => undefined);
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
          deleteWorkbook().catch(() => undefined);
        }}
        onManualSync={() => {
          syncNow().catch(() => undefined);
        }}
        onOpenFindReplace={() => {
          setIsFindReplaceOpen(true);
        }}
        onOpenWorkbook={(workbookId, workbookName) => {
          openWorkbook(workbookId, workbookName).catch(() => undefined);
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
        onToggleFavorite={(isFavorite) => {
          setWorkbookFavorite(isFavorite).catch(() => undefined);
        }}
        onToggleGallery={() => {
          setIsGalleryOpen((prev) => !prev);
        }}
        onUndo={() => {
          undo().catch(() => undefined);
        }}
        recentWorkbooks={workbooks}
        saveState={saveState}
        workbookId={activeWorkbook?.id ?? null}
        workbookName={activeWorkbook?.name ?? "Untitled spreadsheet"}
      />
      {isGalleryOpen && <TemplateGalleryPanel />}
      <Toolbar
        canRedo={canRedo}
        canUndo={canUndo}
        onRedo={() => {
          redo().catch(() => undefined);
        }}
        onUndo={() => {
          undo().catch(() => undefined);
        }}
      />
      <FormulaBar
        activeCell={activeCell}
        cellRaw={activeCellData.raw}
        getCellReferenceLabel={getCellReferenceLabel}
        onCommit={handleFormulaCommit}
        onValueChange={handleFormulaChange}
        primaryColumnName={activeSheetColumns[0]?.name ?? "A"}
      />
      <SpreadsheetGrid
        activeCell={activeCell}
        canExpandRows={canExpandRows}
        columnCount={columnCount}
        columnNames={activeSheetColumns.map((column) => column.name)}
        editingCell={editingCell}
        expandRowCount={expandRowCount}
        getCellData={getCellData}
        navigateFromActive={navigateFromActive}
        onRenameColumn={(columnIndex, columnName) =>
          renameColumn(columnIndex, columnName)
        }
        rowCount={rowCount}
        selectCell={selectCell}
        selection={selection}
        setCellValue={setCellValue}
        setSelectionRange={setSelectionRange}
        showAllRows={showAllRows}
        startEditing={startEditing}
        stopEditing={stopEditing}
      />
      <SheetTabs
        activeSheetId={activeSheetId}
        disabled={hydrationState !== "ready"}
        onAddSheet={() => {
          createSheet().catch(() => undefined);
        }}
        onSelectSheet={(sheetId) => {
          setActiveSheet(sheetId).catch(() => undefined);
        }}
        sheets={sheets}
      />
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
