"use client";

import type { SheetMeta } from "@papyrus/core/workbook-types";
import { CaretLeftIcon, CaretRightIcon, PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/web/components/ui/button";

interface SheetTabsProps {
  activeSheetId: string | null;
  disableCreation?: boolean;
  disabled?: boolean;
  onAddSheet: () => void;
  onSelectSheet: (sheetId: string) => void;
  sheets: SheetMeta[];
}

export function SheetTabs({
  activeSheetId,
  disabled = false,
  disableCreation = false,
  onAddSheet,
  onSelectSheet,
  sheets,
}: SheetTabsProps) {
  const activeSheetIndex = sheets.findIndex(
    (sheet) => sheet.id === activeSheetId
  );
  const previousSheet =
    activeSheetIndex > 0 ? sheets[activeSheetIndex - 1] : null;
  const nextSheet =
    activeSheetIndex >= 0 && activeSheetIndex < sheets.length - 1
      ? sheets[activeSheetIndex + 1]
      : null;

  return (
    <div
      className="flex h-8 shrink-0 items-center border-border border-t bg-background px-1"
      data-slot="sheet-tabs"
    >
      <Button
        aria-label="Previous sheet"
        className="h-6 w-6"
        disabled={disabled || !previousSheet}
        onClick={() => {
          if (previousSheet) {
            onSelectSheet(previousSheet.id);
          }
        }}
        size="icon-xs"
        variant="ghost"
      >
        <CaretLeftIcon weight="bold" />
      </Button>
      <Button
        aria-label="Next sheet"
        className="h-6 w-6"
        disabled={disabled || !nextSheet}
        onClick={() => {
          if (nextSheet) {
            onSelectSheet(nextSheet.id);
          }
        }}
        size="icon-xs"
        variant="ghost"
      >
        <CaretRightIcon weight="bold" />
      </Button>

      <Button
        aria-label="Add sheet"
        className="ml-1 h-6 w-6"
        disabled={disabled || disableCreation}
        onClick={onAddSheet}
        size="icon-xs"
        variant="ghost"
      >
        <PlusIcon weight="bold" />
      </Button>

      <div className="ml-1 flex items-center gap-0.5">
        {sheets.map((sheet) => (
          <Button
            className={
              sheet.id === activeSheetId
                ? "h-6 rounded-t-sm border-primary border-b-2 bg-accent px-3 font-medium text-xs"
                : "h-6 rounded-t-sm border-transparent border-b-2 px-3 text-xs"
            }
            disabled={disabled}
            key={sheet.id}
            onClick={() => {
              onSelectSheet(sheet.id);
            }}
            size="xs"
            variant="ghost"
          >
            {sheet.name}
          </Button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2 pr-2 text-muted-foreground text-xs">
        <span>Sum: 0</span>
        <span>Average: 0</span>
        <span>Count: 0</span>
      </div>
    </div>
  );
}
