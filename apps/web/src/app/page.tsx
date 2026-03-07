"use client";

import { useCallback, useState } from "react";
import { FormulaBar } from "@/web/components/spreadsheet/formula-bar";
import { SpreadsheetMenuBar } from "@/web/components/spreadsheet/menu-bar";
import { SheetTabs } from "@/web/components/spreadsheet/sheet-tabs";
import { SpreadsheetGrid } from "@/web/components/spreadsheet/spreadsheet-grid";
import { TemplateGalleryPanel } from "@/web/components/spreadsheet/template-gallery";
import { Toolbar } from "@/web/components/spreadsheet/toolbar";
import { useSpreadsheet } from "@/web/hooks/use-spreadsheet";

export default function Home() {
  const {
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
        columnCount={columnCount}
        editingCell={editingCell}
        getCellData={getCellData}
        navigateFromActive={navigateFromActive}
        rowCount={rowCount}
        selectCell={selectCell}
        setCellValue={setCellValue}
        startEditing={startEditing}
        stopEditing={stopEditing}
      />
      <SheetTabs />
    </div>
  );
}
