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
    canExpandRows,
    editingCell,
    columnCount,
    expandRowCount,
    rowCount,
    showAllRows,
    getCellData,
    setCellValue,
    selectCell,
    startEditing,
    stopEditing,
    navigateFromActive,
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
        isGalleryOpen={isGalleryOpen}
        onToggleGallery={() => {
          setIsGalleryOpen((prev) => !prev);
        }}
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
        setCellValue={setCellValue}
        showAllRows={showAllRows}
        startEditing={startEditing}
        stopEditing={stopEditing}
      />
      <SheetTabs />
    </div>
  );
}
