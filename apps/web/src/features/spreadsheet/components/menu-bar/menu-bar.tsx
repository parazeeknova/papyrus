"use client";

import type {
  CollaborationAccessRole,
  CollaboratorIdentity,
  CollaboratorPresence,
} from "@papyrus/core/collaboration-types";
import type { WorkbookMeta } from "@papyrus/core/workbook-types";
import {
  ArrowClockwiseIcon,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/web/components/ui/dropdown-menu";
import { Input } from "@/web/components/ui/input";
import { Menubar } from "@/web/components/ui/menubar";
import { Separator } from "@/web/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/web/components/ui/tooltip";
import { CollaboratorAvatar } from "@/web/features/spreadsheet/components/collaboration/collaborator-avatar";
import { AboutPapyrusDialog } from "@/web/features/spreadsheet/components/dialogs/about-papyrus-dialog";
import { FunctionListDialog } from "@/web/features/spreadsheet/components/dialogs/function-list-dialog";
import { ShareDialog } from "@/web/features/spreadsheet/components/dialogs/share-dialog";
import { DataMenu } from "@/web/features/spreadsheet/components/menu-bar/data-menu";
import { EditMenu } from "@/web/features/spreadsheet/components/menu-bar/edit-menu";
import { FileMenu } from "@/web/features/spreadsheet/components/menu-bar/file-menu";
import { FormatMenu } from "@/web/features/spreadsheet/components/menu-bar/format-menu";
import { HelpMenu } from "@/web/features/spreadsheet/components/menu-bar/help-menu";
import { InsertMenu } from "@/web/features/spreadsheet/components/menu-bar/insert-menu";
import { ViewMenu } from "@/web/features/spreadsheet/components/menu-bar/view-menu";

interface SpreadsheetMenuBarProps {
  canEdit: boolean;
  canManualSync: boolean;
  canRedo: boolean;
  canUndo: boolean;
  collaborationAccessRole: CollaborationAccessRole | null;
  collaborationIdentity: CollaboratorIdentity | null;
  collaborationPeers: CollaboratorPresence[];
  collaborationStatus: "connected" | "connecting" | "disconnected";
  isFavorite: boolean;
  isGalleryOpen: boolean;
  lastSyncedLabel: string | null;
  onCopy: () => void;
  onCreateWorkbook: () => void;
  onCut: () => void;
  onDeleteColumn: () => void;
  onDeleteRow: () => void;
  onDeleteWorkbook: () => void;
  onManualSync: () => void;
  onOpenFindReplace: () => void;
  onOpenWorkbook: (workbookId: string, workbookName: string) => void;
  onPaste: () => void;
  onRedo: () => void;
  onRenameWorkbook: (name: string) => void;
  onToggleFavorite: (isFavorite: boolean) => void;
  onToggleGallery: () => void;
  onUndo: () => void;
  recentWorkbooks: WorkbookMeta[];
  remoteSyncStatus:
    | "disabled"
    | "error"
    | "idle"
    | "pending"
    | "syncing"
    | "synced";
  saveState: "error" | "saved" | "saving";
  syncServerUrl: string | null;
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
  canEdit,
  canManualSync,
  canRedo,
  canUndo,
  collaborationAccessRole,
  collaborationIdentity,
  collaborationPeers,
  collaborationStatus,
  isGalleryOpen,
  isFavorite,
  lastSyncedLabel,
  onCopy,
  onCreateWorkbook,
  onCut,
  onDeleteColumn,
  onDeleteRow,
  onDeleteWorkbook,
  onManualSync,
  onOpenFindReplace,
  onOpenWorkbook,
  onPaste,
  onRedo,
  onRenameWorkbook,
  onToggleFavorite,
  onToggleGallery,
  onUndo,
  recentWorkbooks,
  remoteSyncStatus,
  saveState,
  syncServerUrl,
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

  const remoteSyncLabel =
    remoteSyncStatus === "syncing"
      ? "Syncing"
      : remoteSyncStatus === "pending"
        ? "Pending sync"
        : remoteSyncStatus === "error"
          ? "Sync error"
          : remoteSyncStatus === "synced"
            ? "Synced"
            : remoteSyncStatus === "idle"
              ? "Cloud ready"
              : "Local only";
  const hasPendingChanges = remoteSyncStatus === "pending";

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
                disabled={!canEdit}
                onClick={() => {
                  if (canEdit) {
                    setIsRenamingWorkbook(true);
                  }
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
                  disabled={!canEdit}
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="size-7"
                  disabled={!canManualSync}
                  onClick={onManualSync}
                  size="icon-sm"
                  variant="ghost"
                >
                  <ArrowClockwiseIcon className="size-3.5" weight="bold" />
                  <span className="sr-only">Manual sync</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {canManualSync
                  ? "Sync workbooks to cloud"
                  : "Manual sync available every 5 seconds"}
              </TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-left text-muted-foreground text-xs transition-colors hover:bg-accent"
                  type="button"
                >
                  <CloudCheckIcon className="size-3.5" weight="fill" />
                  <span>
                    {saveState === "saving" ? "Saving..." : remoteSyncLabel}
                  </span>
                  {lastSyncedLabel ? (
                    <span className="text-muted-foreground/80">
                      · Synced {lastSyncedLabel}
                    </span>
                  ) : null}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-72 p-0"
                sideOffset={8}
              >
                <div className="space-y-3 px-4 py-3 text-xs">
                  <div>
                    <p className="font-medium text-foreground text-sm">
                      Sync details
                    </p>
                    <p className="text-muted-foreground">
                      Firestore persistence status for this workbook.
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Status</span>
                      <span className="font-medium text-foreground">
                        {remoteSyncLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Last sync</span>
                      <span className="font-medium text-foreground">
                        {lastSyncedLabel ?? "Not synced yet"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        Pending changes
                      </span>
                      <span className="font-medium text-foreground">
                        {hasPendingChanges ? "Yes" : "No"}
                      </span>
                    </div>
                  </div>

                  <div className="border-border border-t pt-2 text-muted-foreground">
                    Realtime presence is {collaborationStatus}.
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-1.5">
                {collaborationIdentity ? (
                  <CollaboratorAvatar
                    identity={collaborationIdentity}
                    ringClassName="ring-2 ring-background"
                    size="md"
                  />
                ) : null}
                {collaborationPeers.slice(0, 2).map((peer) => (
                  <CollaboratorAvatar
                    identity={peer.identity}
                    key={peer.identity.clientId}
                    ringClassName="ring-2 ring-background"
                    size="md"
                  />
                ))}
              </div>
              <div className="hidden sm:block">
                <p className="font-medium text-[11px] leading-none">
                  {collaborationPeers.length > 0
                    ? `${collaborationPeers.length + 1} live`
                    : "Solo"}
                </p>
                <p className="text-[10px] text-muted-foreground leading-none">
                  {collaborationStatus === "connected"
                    ? "Realtime connected"
                    : collaborationStatus === "connecting"
                      ? "Connecting"
                      : "Realtime offline"}
                </p>
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

            <ShareDialog
              accessRole={collaborationAccessRole ?? "editor"}
              canEdit={canEdit}
              collaborators={collaborationPeers}
              currentIdentity={collaborationIdentity}
              realtimeStatus={collaborationStatus}
              syncServerUrl={syncServerUrl}
              workbookId={workbookId}
              workbookName={workbookName}
            />

            <GoogleAuthDialog />
          </div>
        </div>

        <Menubar className="h-7 border-0 bg-transparent px-2">
          <FileMenu
            canEdit={canEdit}
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
          <EditMenu
            canEdit={canEdit}
            canRedo={canRedo}
            canUndo={canUndo}
            onCopy={onCopy}
            onCut={onCut}
            onDeleteColumn={onDeleteColumn}
            onDeleteRow={onDeleteRow}
            onOpenFindReplace={onOpenFindReplace}
            onPaste={onPaste}
            onRedo={onRedo}
            onUndo={onUndo}
          />
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
