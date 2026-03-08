"use client";

import type { CollaborationAccessRole } from "@papyrus/core/collaboration-types";
import { createWorkbookId } from "@papyrus/core/workbook-doc";
import type { SheetMeta } from "@papyrus/core/workbook-types";
import { useRouter } from "next/navigation";
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
    activeSelectionFormat,
    activeWorkbook,
    activeSheetId,
    activeSheetRowHeights,
    canEdit,
    canRedo,
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
    deleteWorkbook,
    editingCell,
    columnCount,
    expandRowCount,
    findNext,
    hydrationState,
    lastSyncErrorMessage,
    lastSyncedLabel,
    pasteSelection,
    redo,
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
    showAllRows,
    syncNow,
    getCellData,
    getCellFormat,
    getCellReferenceLabel,
    setCellValue,
    selectCell,
    startEditing,
    stopEditing,
    toggleCellFormat,
    undo,
    navigateFromActive,
    workbooks,
  } = useSpreadsheet({
    isSharedSession,
    requestedAccessRole,
    syncServerUrl,
    workbookId,
  });

  const activeCellData = activeCell
    ? getCellData(activeCell.row, activeCell.col)
    : { raw: "", computed: "" };
  const isInitialLoad =
    hydrationState === "idle" || hydrationState === "loading";
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
  }, [activeCell, navigateFromActive, stopEditing]);

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

  useEffect(() => {
    if (
      isSharedSession ||
      !activeWorkbook?.id ||
      activeWorkbook.id === workbookId
    ) {
      return;
    }

    router.replace(`/workbook/${activeWorkbook.id}`);
  }, [activeWorkbook?.id, isSharedSession, router, workbookId]);

  return (
    <div className="flex h-screen flex-col bg-background font-sans">
      <SpreadsheetMenuBar
        canEdit={canEdit}
        canManageSharing={canManageSharing}
        canManualSync={canManualSync}
        canRedo={canRedo}
        canUndo={canUndo}
        collaborationAccessRole={collaborationAccessRole}
        collaborationErrorMessage={collaborationErrorMessage}
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
          deleteWorkbook().catch(() => undefined);
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
        onToggleFavorite={(isFavorite) => {
          setWorkbookFavorite(isFavorite).catch(() => undefined);
        }}
        onToggleGallery={() => {
          setIsGalleryOpen((prev) => !prev);
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
        recentWorkbooks={workbooks}
        remoteSyncStatus={remoteSyncStatus}
        remoteVersion={remoteVersion}
        saveState={saveState}
        sharingAccessRole={sharingAccessRole}
        sharingEnabled={sharingEnabled}
        syncServerUrl={syncServerUrl}
        workbookId={activeWorkbook?.id ?? null}
        workbookName={activeWorkbook?.name ?? "Untitled spreadsheet"}
      />
      {isGalleryOpen ? <TemplateGalleryPanel /> : null}
      <Toolbar
        activeFontFamily={activeSelectionFormat?.fontFamily ?? null}
        activeFontSize={activeSelectionFormat?.fontSize ?? null}
        activeTextColor={activeSelectionFormat?.textColor ?? null}
        boldActive={activeSelectionFormat?.bold ?? false}
        canEdit={canEdit}
        canRedo={canRedo}
        canUndo={canUndo}
        italicActive={activeSelectionFormat?.italic ?? false}
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
        columnWidths={activeSheetColumns.map((column) => column.width)}
        disabled={isInitialLoad}
        editingCell={isInitialLoad ? null : editingCell}
        expandRowCount={expandRowCount}
        getCellData={isInitialLoad ? getLoadingCellData : getCellData}
        getCellFormat={isInitialLoad ? () => ({}) : getCellFormat}
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
        onResizeColumn={(columnIndex, width) => {
          resizeColumn(columnIndex, width).catch(() => undefined);
        }}
        onResizeRow={(rowIndex, height) => {
          resizeRow(rowIndex, height).catch(() => undefined);
        }}
        onUndo={() => {
          undo().catch(() => undefined);
        }}
        rowCount={rowCount}
        rowHeights={isInitialLoad ? {} : activeSheetRowHeights}
        selectCell={isInitialLoad ? () => undefined : selectCell}
        selection={isInitialLoad ? null : selection}
        setCellValue={setCellValue}
        setSelectionRange={isInitialLoad ? () => undefined : setSelectionRange}
        sheetId={visibleActiveSheetId}
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

export function WorkbookPageClient(props: WorkbookPageClientProps) {
  return (
    <Suspense fallback={null}>
      <WorkbookPageContent {...props} />
    </Suspense>
  );
}
