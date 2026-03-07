"use client";

import { CloudCheckIcon, LockIcon, StarIcon } from "@phosphor-icons/react";
import Image from "next/image";
import { Button } from "@/web/components/ui/button";
import {
  Menubar,
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
import { Separator } from "@/web/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/web/components/ui/tooltip";

export function SpreadsheetMenuBar() {
  return (
    <div
      className="flex shrink-0 flex-col border-border border-b bg-background"
      data-slot="menu-bar"
    >
      <div className="flex h-10 items-center gap-2 px-3">
        <Image
          alt="Papyrus logo"
          className="size-6 rounded-md"
          height={28}
          src="/apple-touch-icon.png"
          width={28}
        />

        <div className="flex items-center gap-1">
          <button
            className="rounded-sm px-1.5 py-0.5 font-medium text-sm transition-colors hover:bg-accent"
            type="button"
          >
            Untitled spreadsheet
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Star"
                className="text-muted-foreground"
                size="icon-xs"
                variant="ghost"
              >
                <StarIcon weight="regular" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Star</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1 text-muted-foreground text-xs">
          <CloudCheckIcon className="size-3.5" weight="fill" />
          <span>Saved</span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5">
          <div className="flex -space-x-1.5">
            <div className="flex size-7 items-center justify-center rounded-full bg-chart-1 font-semibold text-white text-xs ring-2 ring-background">
              Y
            </div>
          </div>

          <Separator className="mx-1 h-5" orientation="vertical" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button className="gap-1 text-xs" size="sm" variant="ghost">
                <LockIcon className="size-3.5" weight="bold" />
                <span className="hidden sm:inline">Share</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Share this document</TooltipContent>
          </Tooltip>

          <Button
            aria-label="User menu"
            className="size-8 rounded-full bg-chart-2 font-semibold text-white text-xs"
            size="icon"
            variant="ghost"
          >
            U
          </Button>
        </div>
      </div>

      <Menubar className="h-7 border-0 bg-transparent px-2">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              New <MenubarShortcut>⌘N</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>
              Open <MenubarShortcut>⌘O</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem>Make a copy</MenubarItem>
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
            <MenubarItem>Rename</MenubarItem>
            <MenubarItem>
              Print <MenubarShortcut>⌘P</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              Undo <MenubarShortcut>⌘Z</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>
              Redo <MenubarShortcut>⌘Y</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem>
              Cut <MenubarShortcut>⌘X</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>
              Copy <MenubarShortcut>⌘C</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>
              Paste <MenubarShortcut>⌘V</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem>
              Find and replace <MenubarShortcut>⌘H</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>Delete row</MenubarItem>
            <MenubarItem>Delete column</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>View</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Freeze rows</MenubarItem>
            <MenubarItem>Freeze columns</MenubarItem>
            <MenubarSeparator />
            <MenubarItem>Gridlines</MenubarItem>
            <MenubarItem>Formula bar</MenubarItem>
            <MenubarSeparator />
            <MenubarItem>Zoom in</MenubarItem>
            <MenubarItem>Zoom out</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Insert</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Row above</MenubarItem>
            <MenubarItem>Row below</MenubarItem>
            <MenubarSeparator />
            <MenubarItem>Column left</MenubarItem>
            <MenubarItem>Column right</MenubarItem>
            <MenubarSeparator />
            <MenubarItem>Function</MenubarItem>
            <MenubarItem>Chart</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Format</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              Bold <MenubarShortcut>⌘B</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>
              Italic <MenubarShortcut>⌘I</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>
              Underline <MenubarShortcut>⌘U</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger>Number</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem>Automatic</MenubarItem>
                <MenubarItem>Plain text</MenubarItem>
                <MenubarItem>Number</MenubarItem>
                <MenubarItem>Percent</MenubarItem>
                <MenubarItem>Currency</MenubarItem>
                <MenubarItem>Date</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarItem>Conditional formatting</MenubarItem>
            <MenubarItem>Alternating colors</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Data</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Sort range A → Z</MenubarItem>
            <MenubarItem>Sort range Z → A</MenubarItem>
            <MenubarSeparator />
            <MenubarItem>Create filter</MenubarItem>
            <MenubarItem>Data validation</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Tools</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Notifications</MenubarItem>
            <MenubarItem>Macros</MenubarItem>
            <MenubarSeparator />
            <MenubarItem>Script editor</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Help</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Search the menus</MenubarItem>
            <MenubarSeparator />
            <MenubarItem>Keyboard shortcuts</MenubarItem>
            <MenubarItem>Function list</MenubarItem>
            <MenubarSeparator />
            <MenubarItem>About Papyrus</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    </div>
  );
}
