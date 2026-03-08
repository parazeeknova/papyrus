"use client";

import type { SheetMeta } from "@papyrus/core/workbook-types";
import {
  CaretLeftIcon,
  CaretRightIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { Button } from "@/web/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/web/components/ui/context-menu";

interface SheetTabFooterMetric {
  label: string;
  value: string;
}

interface SheetTabsProps {
  activeSheetId: string | null;
  disableCreation?: boolean;
  disableDeletion?: boolean;
  disabled?: boolean;
  footerMetrics: SheetTabFooterMetric[];
  onAddSheet: () => void;
  onDeleteSheet: (sheetId: string) => void;
  onSelectSheet: (sheetId: string) => void;
  sheets: SheetMeta[];
}

export function SheetTabs({
  activeSheetId,
  disabled = false,
  disableCreation = false,
  disableDeletion = false,
  footerMetrics,
  onAddSheet,
  onDeleteSheet,
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
          <ContextMenu key={sheet.id}>
            <ContextMenuTrigger asChild>
              <Button
                className={
                  sheet.id === activeSheetId
                    ? "h-6 rounded-t-sm border-primary border-b-2 bg-accent px-3 font-medium text-xs"
                    : "h-6 rounded-t-sm border-transparent border-b-2 px-3 text-xs"
                }
                disabled={disabled}
                onClick={() => {
                  onSelectSheet(sheet.id);
                }}
                onContextMenu={() => {
                  if (!disabled && sheet.id !== activeSheetId) {
                    onSelectSheet(sheet.id);
                  }
                }}
                size="xs"
                variant="ghost"
              >
                {sheet.name}
              </Button>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-40">
              <ContextMenuItem
                disabled={disabled || disableCreation}
                onSelect={() => {
                  onAddSheet();
                }}
              >
                <PlusIcon weight="bold" />
                Add sheet
              </ContextMenuItem>
              <ContextMenuItem
                disabled={disabled || disableDeletion}
                onSelect={() => {
                  onDeleteSheet(sheet.id);
                }}
                variant="destructive"
              >
                <TrashIcon weight="bold" />
                Delete sheet
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </div>

      <div className="ml-auto max-w-[55%] overflow-x-auto pr-2">
        <div className="flex min-w-max items-center gap-3 whitespace-nowrap text-muted-foreground text-xs">
          {footerMetrics.map((metric) => (
            <span key={metric.label}>
              {metric.label}: {metric.value}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
