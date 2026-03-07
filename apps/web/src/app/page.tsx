"use client";

import { useCallback, useState } from "react";
import { FormulaBar } from "@/web/features/spreadsheet/components/core/formula-bar";
import { SheetTabs } from "@/web/features/spreadsheet/components/core/sheet-tabs";
import { SpreadsheetGrid } from "@/web/features/spreadsheet/components/core/spreadsheet-grid";
import { Toolbar } from "@/web/features/spreadsheet/components/core/toolbar";
import { SpreadsheetMenuBar } from "@/web/features/spreadsheet/components/menu-bar/menu-bar";
import { TemplateGalleryPanel } from "@/web/features/spreadsheet/components/template-gallery";
import { useSpreadsheet } from "@/web/features/spreadsheet/hooks/use-spreadsheet";

export default function Home() {
  const {
    activeCell,
    activeSheetColumns,
    activeWorkbook,
    activeSheetId,
    canExpandRows,
    createSheet,
    createWorkbook,
    deleteWorkbook,
    editingCell,
    columnCount,
    expandRowCount,
    hydrationState,
    openWorkbook,
    renameColumn,
    renameWorkbook,
    rowCount,
    saveState,
    setActiveSheet,
    setWorkbookFavorite,
    sheets,
    selection,
    setSelectionRange,
    showAllRows,
    getCellData,
    getCellReferenceLabel,
    setCellValue,
    selectCell,
    startEditing,
    stopEditing,
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

  return (
    <div className="flex h-screen flex-col bg-background font-sans">
      <SpreadsheetMenuBar
        isFavorite={activeWorkbook?.isFavorite ?? false}
        isGalleryOpen={isGalleryOpen}
        onCreateWorkbook={() => {
          createWorkbook().catch(() => undefined);
        }}
        onDeleteWorkbook={() => {
          deleteWorkbook().catch(() => undefined);
        }}
        onOpenWorkbook={(workbookId, workbookName) => {
          openWorkbook(workbookId, workbookName).catch(() => undefined);
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
        recentWorkbooks={workbooks}
        saveState={saveState}
        workbookId={activeWorkbook?.id ?? null}
        workbookName={activeWorkbook?.name ?? "Untitled spreadsheet"}
      />
      {isGalleryOpen && <TemplateGalleryPanel />}
      <Toolbar />
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
    </div>
  );
}
