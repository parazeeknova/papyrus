"use client";

import type { WorkbookMeta } from "@papyrus/core/workbook-types";
import { DotOutlineIcon } from "@phosphor-icons/react";
import {
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/web/components/ui/menubar";

interface FileMenuProps {
  onCreateWorkbook: () => void;
  onOpenWorkbook: (workbookId: string, workbookName: string) => void;
  onPrint: () => void;
  onRequestDeleteWorkbook: () => void;
  onRequestRenameWorkbook: () => void;
  recentWorkbooks: WorkbookMeta[];
  workbookId: string | null;
}

const RECENT_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatLastOpened(lastOpenedAt: string): string {
  const timestamp = new Date(lastOpenedAt);
  if (Number.isNaN(timestamp.getTime())) {
    return "Unknown";
  }

  return RECENT_TIME_FORMATTER.format(timestamp);
}

export function FileMenu({
  onCreateWorkbook,
  onOpenWorkbook,
  onPrint,
  onRequestDeleteWorkbook,
  onRequestRenameWorkbook,
  recentWorkbooks,
  workbookId,
}: FileMenuProps) {
  return (
    <MenubarMenu>
      <MenubarTrigger>File</MenubarTrigger>
      <MenubarContent>
        <MenubarItem
          onSelect={() => {
            onCreateWorkbook();
          }}
        >
          New <MenubarShortcut>Cmd+N</MenubarShortcut>
        </MenubarItem>
        <MenubarSub>
          <MenubarSubTrigger>Recent</MenubarSubTrigger>
          <MenubarSubContent className="min-w-60">
            {recentWorkbooks.length > 0 ? (
              recentWorkbooks.map((recentWorkbook) => (
                <MenubarItem
                  className="items-start gap-1"
                  key={recentWorkbook.id}
                  onSelect={() => {
                    onOpenWorkbook(recentWorkbook.id, recentWorkbook.name);
                  }}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {recentWorkbook.id === workbookId ? (
                      <DotOutlineIcon
                        className="size-4 text-primary"
                        weight="fill"
                      />
                    ) : null}
                    <div className="min-w-0">
                      <p className="truncate">{recentWorkbook.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        Last opened{" "}
                        {formatLastOpened(recentWorkbook.lastOpenedAt)}
                      </p>
                    </div>
                  </div>
                </MenubarItem>
              ))
            ) : (
              <MenubarItem disabled>No recent spreadsheets</MenubarItem>
            )}
          </MenubarSubContent>
        </MenubarSub>
        <MenubarItem>
          Open <MenubarShortcut>Cmd+O</MenubarShortcut>
        </MenubarItem>
        <MenubarSub>
          <MenubarSubTrigger>Download</MenubarSubTrigger>
          <MenubarSubContent>
            <MenubarItem>CSV (.csv)</MenubarItem>
            <MenubarItem>Excel (.xlsx)</MenubarItem>
            <MenubarItem>PDF (.pdf)</MenubarItem>
            <MenubarItem>JSON (.json)</MenubarItem>
          </MenubarSubContent>
        </MenubarSub>
        <MenubarSeparator />
        <MenubarItem
          onSelect={() => {
            onRequestRenameWorkbook();
          }}
        >
          Rename
        </MenubarItem>
        <MenubarItem
          onSelect={() => {
            onPrint();
          }}
        >
          Print <MenubarShortcut>Cmd+P</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          disabled={!workbookId}
          onSelect={() => {
            onRequestDeleteWorkbook();
          }}
        >
          Delete spreadsheet
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
