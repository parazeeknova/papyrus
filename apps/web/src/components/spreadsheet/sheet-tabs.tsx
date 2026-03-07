"use client";

import { CaretLeftIcon, CaretRightIcon, PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/web/components/ui/button";

export function SheetTabs() {
  return (
    <div
      className="flex h-8 shrink-0 items-center border-border border-t bg-background px-1"
      data-slot="sheet-tabs"
    >
      <Button
        aria-label="Previous sheet"
        className="h-6 w-6"
        size="icon-xs"
        variant="ghost"
      >
        <CaretLeftIcon weight="bold" />
      </Button>
      <Button
        aria-label="Next sheet"
        className="h-6 w-6"
        size="icon-xs"
        variant="ghost"
      >
        <CaretRightIcon weight="bold" />
      </Button>

      <Button
        aria-label="Add sheet"
        className="ml-1 h-6 w-6"
        size="icon-xs"
        variant="ghost"
      >
        <PlusIcon weight="bold" />
      </Button>

      <div className="ml-1 flex items-center gap-0.5">
        <Button
          className="h-6 rounded-t-sm border-primary border-b-2 bg-accent px-3 font-medium text-xs"
          size="xs"
          variant="ghost"
        >
          Sheet1
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-2 pr-2 text-muted-foreground text-xs">
        <span>Sum: 0</span>
        <span>Average: 0</span>
        <span>Count: 0</span>
      </div>
    </div>
  );
}
