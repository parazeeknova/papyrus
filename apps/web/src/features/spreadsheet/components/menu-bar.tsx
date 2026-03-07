"use client";

import type { WorkbookMeta } from "@papyrus/core/workbook-types";
import {
  CloudCheckIcon,
  SquaresFourIcon,
  StarIcon,
} from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Button } from "@/web/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/web/components/ui/dialog";
import { Input } from "@/web/components/ui/input";
import { Menubar } from "@/web/components/ui/menubar";
import { Separator } from "@/web/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/web/components/ui/tooltip";
import { AboutPapyrusDialog } from "@/web/features/spreadsheet/components/about-papyrus-dialog";
import { FunctionListDialog } from "@/web/features/spreadsheet/components/function-list-dialog";
import { DataMenu } from "@/web/features/spreadsheet/components/menu-bar/data-menu";
import { EditMenu } from "@/web/features/spreadsheet/components/menu-bar/edit-menu";
import { FileMenu } from "@/web/features/spreadsheet/components/menu-bar/file-menu";
import { FormatMenu } from "@/web/features/spreadsheet/components/menu-bar/format-menu";
import { HelpMenu } from "@/web/features/spreadsheet/components/menu-bar/help-menu";
import { InsertMenu } from "@/web/features/spreadsheet/components/menu-bar/insert-menu";
import { ViewMenu } from "@/web/features/spreadsheet/components/menu-bar/view-menu";
import { ShareDialog } from "@/web/features/spreadsheet/components/share-dialog";

interface SpreadsheetMenuBarProps {
  isFavorite: boolean;
  isGalleryOpen: boolean;
  onCreateWorkbook: () => void;
  onDeleteWorkbook: () => void;
  onOpenWorkbook: (workbookId: string, workbookName: string) => void;
  onRenameWorkbook: (name: string) => void;
  onToggleFavorite: (isFavorite: boolean) => void;
  onToggleGallery: () => void;
  recentWorkbooks: WorkbookMeta[];
  saveState: "error" | "saved" | "saving";
  workbookId: string | null;
  workbookName: string;
}

function AccountButtonFallback() {
  return (
    <Button
      aria-label="Open Google login dialog"
      className="relative size-8 rounded-full"
      size="icon"
      variant="ghost"
    >
      <div className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border/60">
        U
      </div>
      <span className="absolute right-0.5 bottom-0.5 size-2 rounded-full bg-border ring-2 ring-background" />
    </Button>
  );
}

const GoogleAuthDialog = dynamic(
  async () =>
    import("@/web/features/auth/components/google-auth-dialog").then(
      (mod) => mod.GoogleAuthDialog
    ),
  {
    loading: AccountButtonFallback,
    ssr: false,
  }
);

export function SpreadsheetMenuBar({
  isGalleryOpen,
  isFavorite,
  onCreateWorkbook,
  onDeleteWorkbook,
  onOpenWorkbook,
  onRenameWorkbook,
  onToggleFavorite,
  onToggleGallery,
  recentWorkbooks,
  saveState,
  workbookId,
  workbookName,
}: SpreadsheetMenuBarProps) {
  const [isRenamingWorkbook, setIsRenamingWorkbook] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isFunctionListDialogOpen, setIsFunctionListDialogOpen] =
    useState(false);
  const [workbookNameDraft, setWorkbookNameDraft] = useState(workbookName);

  useEffect(() => {
    setWorkbookNameDraft(workbookName);
  }, [workbookName]);

  const commitWorkbookRename = () => {
    setIsRenamingWorkbook(false);
    onRenameWorkbook(workbookNameDraft);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
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
            {isRenamingWorkbook ? (
              <Input
                autoFocus
                className="h-7 w-48 border-transparent px-1.5 py-0.5 font-medium text-sm shadow-none focus-visible:border-ring"
                onBlur={commitWorkbookRename}
                onChange={(event) => {
                  setWorkbookNameDraft(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitWorkbookRename();
                  }

                  if (event.key === "Escape") {
                    event.preventDefault();
                    setWorkbookNameDraft(workbookName);
                    setIsRenamingWorkbook(false);
                  }
                }}
                value={workbookNameDraft}
              />
            ) : (
              <button
                className="rounded-sm px-1.5 py-0.5 font-medium text-sm transition-colors hover:bg-accent"
                onClick={() => {
                  setIsRenamingWorkbook(true);
                }}
                type="button"
              >
                {workbookName}
              </button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={
                    isFavorite ? "Remove from favorites" : "Add to favorites"
                  }
                  className={
                    isFavorite ? "text-primary" : "text-muted-foreground"
                  }
                  onClick={() => {
                    onToggleFavorite(!isFavorite);
                  }}
                  size="icon-xs"
                  variant="ghost"
                >
                  <StarIcon weight={isFavorite ? "fill" : "regular"} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isFavorite ? "Favorite spreadsheet" : "Add to favorites"}
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-1 text-muted-foreground text-xs">
            <CloudCheckIcon className="size-3.5" weight="fill" />
            <span>
              {saveState === "saving"
                ? "Saving..."
                : saveState === "error"
                  ? "Save error"
                  : "Saved"}
            </span>
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
                <Button
                  className={`gap-1 text-xs ${isGalleryOpen ? "bg-accent text-accent-foreground" : ""}`}
                  onClick={onToggleGallery}
                  size="sm"
                  variant="ghost"
                >
                  <SquaresFourIcon
                    className="size-3.5"
                    weight={isGalleryOpen ? "fill" : "bold"}
                  />
                  <span className="hidden sm:inline">Templates</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Template gallery</TooltipContent>
            </Tooltip>

            <Separator className="mx-1 h-5" orientation="vertical" />

            <ShareDialog />

            <GoogleAuthDialog />
          </div>
        </div>

        <Menubar className="h-7 border-0 bg-transparent px-2">
          <FileMenu
            onCreateWorkbook={onCreateWorkbook}
            onOpenWorkbook={onOpenWorkbook}
            onPrint={handlePrint}
            onRequestDeleteWorkbook={() => {
              setIsDeleteDialogOpen(true);
            }}
            onRequestRenameWorkbook={() => {
              setIsRenamingWorkbook(true);
            }}
            recentWorkbooks={recentWorkbooks}
            workbookId={workbookId}
          />
          <EditMenu />
          <ViewMenu />
          <InsertMenu />
          <FormatMenu />
          <DataMenu />
          <HelpMenu
            onOpenAbout={() => {
              setIsAboutDialogOpen(true);
            }}
            onOpenFunctionList={() => {
              setIsFunctionListDialogOpen(true);
            }}
          />
        </Menubar>
      </div>

      <AboutPapyrusDialog
        onOpenChange={setIsAboutDialogOpen}
        open={isAboutDialogOpen}
      />

      <FunctionListDialog
        onOpenChange={setIsFunctionListDialogOpen}
        open={isFunctionListDialogOpen}
      />

      <Dialog onOpenChange={setIsDeleteDialogOpen} open={isDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete spreadsheet?</DialogTitle>
            <DialogDescription>
              This permanently removes `{workbookName}` from IndexedDB on this
              device.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                setIsDeleteDialogOpen(false);
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setIsDeleteDialogOpen(false);
                onDeleteWorkbook();
              }}
              variant="destructive"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
