"use client";

import type { SheetMeta } from "@papyrus/core/workbook-types";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { env } from "@/web/env";
import { FormulaBar } from "@/web/features/spreadsheet/components/core/formula-bar";
import { SheetTabs } from "@/web/features/spreadsheet/components/core/sheet-tabs";
import { SpreadsheetGrid } from "@/web/features/spreadsheet/components/core/spreadsheet-grid";
import { Toolbar } from "@/web/features/spreadsheet/components/core/toolbar";
import { FindReplaceDialog } from "@/web/features/spreadsheet/components/dialogs/find-replace-dialog";
import { SpreadsheetMenuBar } from "@/web/features/spreadsheet/components/menu-bar/menu-bar";
import { TemplateGalleryPanel } from "@/web/features/spreadsheet/components/template-gallery";
import { useSpreadsheet } from "@/web/features/spreadsheet/hooks/use-spreadsheet";
import { getDefaultSyncServerUrl } from "@/web/features/spreadsheet/lib/collaboration";
import { colToLetter } from "@/web/features/spreadsheet/lib/spreadsheet-engine";

const INITIAL_LOADING_SHEET: SheetMeta = {
  createdAt: "",
  id: "initial-loading-sheet",
  name: "Sheet1",
  updatedAt: "",
};
const BLANK_CELL = { raw: "", computed: "" };

function HomeContent() {
  const searchParams = useSearchParams();
  const requestedAccessRole = useMemo(() => {
    return searchParams.get("access") === "viewer" ? "viewer" : "editor";
  }, [searchParams]);
  const sharedWorkbookId = searchParams.get("workbook");
  const syncServerUrl = useMemo(() => {
    if (env.NEXT_PUBLIC_SYNC_SERVER_URL) {
      return env.NEXT_PUBLIC_SYNC_SERVER_URL;
    }

    if (typeof window === "undefined") {
      return null;
    }

    return getDefaultSyncServerUrl(window.location.origin);
  }, []);

  const {
    activeCell,
    activeSheetColumns,
    activeWorkbook,
    activeSheetId,
    canEdit,
    canRedo,
    canUndo,
    canExpandRows,
    canManualSync,
    collaborationAccessRole,
    collaborationIdentity,
    collaborationPeers,
    collaborationStatus,
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
    lastSyncErrorMessage,
    lastSyncedLabel,
    openWorkbook,
    pasteSelection,
    redo,
    renameColumn,
    renameWorkbook,
    remoteSyncStatus,
    remoteVersion,
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
  } = useSpreadsheet({
    sharedAccessRole: requestedAccessRole,
    sharedWorkbookId,
    syncServerUrl,
  });

  // Formula bar bindings
  const activeCellData = activeCell
    ? getCellData(activeCell.row, activeCell.col)
    : { raw: "", computed: "" };
  const isInitialLoad =
    activeWorkbook === null &&
    (hydrationState === "idle" || hydrationState === "loading");
  const loadingColumnNames = useMemo(() => {
    return Array.from({ length: columnCount }, (_unused, index) =>
      colToLetter(index)
    );
  }, [columnCount]);
  const visibleSheets = isInitialLoad ? [INITIAL_LOADING_SHEET] : sheets;
  const visibleActiveSheetId = isInitialLoad
    ? INITIAL_LOADING_SHEET.id
    : activeSheetId;
  const getLoadingCellData = useCallback(() => BLANK_CELL, []);
  const navigateWhileLoading = useCallback(() => null, []);

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
        canEdit={canEdit}
        canManualSync={canManualSync}
        canRedo={canRedo}
        canUndo={canUndo}
        collaborationAccessRole={collaborationAccessRole}
        collaborationIdentity={collaborationIdentity}
        collaborationPeers={collaborationPeers}
        collaborationStatus={collaborationStatus}
        isFavorite={activeWorkbook?.isFavorite ?? false}
        isGalleryOpen={isGalleryOpen}
        lastSyncErrorMessage={lastSyncErrorMessage}
        lastSyncedLabel={lastSyncedLabel}
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
        remoteSyncStatus={remoteSyncStatus}
        remoteVersion={remoteVersion}
        saveState={saveState}
        syncServerUrl={syncServerUrl}
        workbookId={activeWorkbook?.id ?? null}
        workbookName={activeWorkbook?.name ?? "Untitled spreadsheet"}
      />
      {isGalleryOpen && <TemplateGalleryPanel />}
      <Toolbar
        canEdit={canEdit}
        canRedo={canRedo}
        canUndo={canUndo}
        loading={isInitialLoad}
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
        onUndo={() => {
          undo().catch(() => undefined);
        }}
      />
      <FormulaBar
        activeCell={activeCell}
        cellRaw={activeCellData.raw}
        disabled={!canEdit || isInitialLoad}
        getCellReferenceLabel={getCellReferenceLabel}
        onCommit={handleFormulaCommit}
        onValueChange={handleFormulaChange}
        primaryColumnName={activeSheetColumns[0]?.name ?? "A"}
      />
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
        disabled={isInitialLoad}
        editingCell={isInitialLoad ? null : editingCell}
        expandRowCount={expandRowCount}
        getCellData={isInitialLoad ? getLoadingCellData : getCellData}
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
        onUndo={() => {
          undo().catch(() => undefined);
        }}
        rowCount={rowCount}
        selectCell={isInitialLoad ? () => undefined : selectCell}
        selection={isInitialLoad ? null : selection}
        setCellValue={setCellValue}
        setSelectionRange={isInitialLoad ? () => undefined : setSelectionRange}
        showAllRows={showAllRows}
        startEditing={isInitialLoad ? () => undefined : startEditing}
        stopEditing={isInitialLoad ? () => undefined : stopEditing}
      />
      <SheetTabs
        activeSheetId={visibleActiveSheetId}
        disableCreation={!canEdit}
        disabled={hydrationState !== "ready"}
        onAddSheet={() => {
          createSheet().catch(() => undefined);
        }}
        onSelectSheet={(sheetId) => {
          setActiveSheet(sheetId).catch(() => undefined);
        }}
        sheets={visibleSheets}
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

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
