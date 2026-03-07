"use client";

import { useCallback, useState } from "react";
import { FormulaBar } from "@/web/features/spreadsheet/components/formula-bar";
import { SpreadsheetMenuBar } from "@/web/features/spreadsheet/components/menu-bar";
import { SheetTabs } from "@/web/features/spreadsheet/components/sheet-tabs";
import { SpreadsheetGrid } from "@/web/features/spreadsheet/components/spreadsheet-grid";
import { TemplateGalleryPanel } from "@/web/features/spreadsheet/components/template-gallery";
import { Toolbar } from "@/web/features/spreadsheet/components/toolbar";
import { useSpreadsheet } from "@/web/features/spreadsheet/hooks/use-spreadsheet";

export default function Home() {
  const {
    activeCell,
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
        onCommit={handleFormulaCommit}
        onValueChange={handleFormulaChange}
      />
      <SpreadsheetGrid
        activeCell={activeCell}
        canExpandRows={canExpandRows}
        columnCount={columnCount}
        editingCell={editingCell}
        expandRowCount={expandRowCount}
        getCellData={getCellData}
        navigateFromActive={navigateFromActive}
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
