"use client";

import type {
  CollaborationAccessRole,
  CollaboratorPresence,
} from "@papyrus/core/collaboration-types";
import type {
  CellTextTransform,
  WorkbookMeta,
} from "@papyrus/core/workbook-types";
import {
  ArrowClockwiseIcon,
  CloudCheckIcon,
  ListIcon,
  StarIcon,
} from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/web/components/ui/badge";
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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import { colToLetter } from "@/web/features/spreadsheet/lib/spreadsheet-engine";

interface SpreadsheetMenuBarProps {
  activeFontFamily: string | null;
  activeFontSize: number | null;
  activeTextColor: string | null;
  boldActive: boolean;
  canEdit: boolean;
  canManageSharing: boolean;
  canManualSync: boolean;
  canRedo: boolean;
  canSortSelection: boolean;
  canUndo: boolean;
  collaborationAccessRole: CollaborationAccessRole | null;
  collaborationErrorMessage: string | null;
  collaborationPeers: CollaboratorPresence[];
  collaborationStatus: "connected" | "connecting" | "disconnected";
  isFavorite: boolean;
  isGalleryOpen: boolean;
  italicActive: boolean;
  lastSyncErrorMessage: string | null;
  lastSyncedLabel: string | null;
  onCopy: () => void;
  onCreateWorkbook: () => void;
  onCut: () => void;
  onDeleteColumn: () => void;
  onDeleteRow: () => void;
  onDeleteWorkbook: () => void;
  onExportCsv: () => void;
  onExportExcel: () => void;
  onImportCsv: (file: File) => void;
  onImportExcel: (file: File) => void;
  onManualSync: () => void;
  onOpenFindReplace: () => void;
  onOpenWorkbook: (workbookId: string, workbookName: string) => void;
  onPaste: () => void;
  onRedo: () => void;
  onRenameWorkbook: (name: string) => void;
  onSetFontFamily: (fontFamily: string | null) => void;
  onSetFontSize: (fontSize: number | null) => void;
  onSetTextColor: (textColor: string | null) => void;
  onSetTextTransform: (textTransform: CellTextTransform | null) => void;
  onSortSelectionAscending: () => void;
  onSortSelectionDescending: () => void;
  onToggleBold: () => void;
  onToggleFavorite: (isFavorite: boolean) => void;
  onToggleGallery: () => void;
  onToggleItalic: () => void;
  onToggleStrikethrough: () => void;
  onToggleUnderline: () => void;
  onUndo: () => void;
  onUpdateSharingAccessRole: (accessRole: CollaborationAccessRole) => void;
  onUpdateSharingEnabled: (sharingEnabled: boolean) => void;
  recentWorkbooks: WorkbookMeta[];
  remoteSyncStatus:
    | "disabled"
    | "error"
    | "idle"
    | "pending"
    | "syncing"
    | "synced";
  remoteVersion: number | null;
  saveState: "error" | "saved" | "saving";
  sharingAccessRole: CollaborationAccessRole;
  sharingEnabled: boolean;
  strikethroughActive: boolean;
  syncServerUrl: string | null;
  textTransform: CellTextTransform | null;
  transientStatusDetail: string | null;
  transientStatusLabel: string | null;
  underlineActive: boolean;
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

function getPresenceStatusLabel(
  collaborationStatus: "connected" | "connecting" | "disconnected"
): string {
  if (collaborationStatus === "connected") {
    return "Realtime connected";
  }

  if (collaborationStatus === "connecting") {
    return "Connecting";
  }

  return "Realtime offline";
}

function formatPresenceCell(
  activeCell: { col: number; row: number } | null
): string | null {
  if (!activeCell) {
    return null;
  }

  return `${colToLetter(activeCell.col)}${activeCell.row + 1}`;
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

interface SyncStatusDropdownProps {
  collaborationStatus: "connected" | "connecting" | "disconnected";
  hasPendingChanges: boolean;
  lastSyncErrorMessage: string | null;
  lastSyncedLabel: string | null;
  remoteSyncLabel: string;
  remoteVersion: number | null;
  saveState: "error" | "saved" | "saving";
}

function SyncStatusDropdown({
  collaborationStatus,
  hasPendingChanges,
  lastSyncErrorMessage,
  lastSyncedLabel,
  remoteSyncLabel,
  remoteVersion,
  saveState,
}: SyncStatusDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 text-left text-muted-foreground text-xs transition-colors hover:bg-accent"
          type="button"
        >
          <CloudCheckIcon className="size-3.5 shrink-0" weight="fill" />
          <span className="truncate">
            {saveState === "saving" ? "Saving..." : remoteSyncLabel}
          </span>
          {lastSyncedLabel ? (
            <span className="hidden truncate text-muted-foreground/80 sm:inline">
              · Synced {lastSyncedLabel}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-0" sideOffset={8}>
        <div className="space-y-3 px-4 py-3 text-xs">
          <div>
            <p className="font-medium text-foreground text-sm">Sync details</p>
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
              <span className="text-muted-foreground">Remote version</span>
              <span className="font-medium text-foreground">
                {remoteVersion ?? "-"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Pending changes</span>
              <span className="font-medium text-foreground">
                {hasPendingChanges ? "Yes" : "No"}
              </span>
            </div>
          </div>

          {lastSyncErrorMessage ? (
            <div className="border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-xs/relaxed">
              {lastSyncErrorMessage}
            </div>
          ) : null}

          <div className="border-border border-t pt-2 text-muted-foreground">
            Realtime presence is {collaborationStatus}.
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface PresenceDropdownProps {
  collaborationErrorMessage: string | null;
  collaborationPeers: CollaboratorPresence[];
  collaborationStatusLabel: string;
}

function PresenceDropdown({
  collaborationErrorMessage,
  collaborationPeers,
  collaborationStatusLabel,
}: PresenceDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-sm px-1 py-0.5 transition-colors hover:bg-accent"
          type="button"
        >
          <div className="flex items-center gap-2">
            {collaborationPeers.length === 0 ? (
              <Badge variant="outline">Solo</Badge>
            ) : null}
            <div className="flex -space-x-1.5">
              {collaborationPeers.slice(0, 2).map((peer) => (
                <CollaboratorAvatar
                  identity={peer.identity}
                  key={peer.identity.clientId}
                  ringClassName="ring-2 ring-background"
                  size="md"
                />
              ))}
            </div>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72 overflow-hidden border-white/10 bg-[#30302E] p-0 text-white shadow-xl ring-1 ring-white/10"
        sideOffset={8}
      >
        <div className="space-y-3 px-4 py-4 text-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-medium text-sm text-white">Presence</p>
              <p className="text-white/60">
                {collaborationPeers.length > 0
                  ? `${collaborationPeers.length} other people in this sheet`
                  : "No one else is here right now"}
              </p>
            </div>
            <Badge className="border-white/10 bg-white/8 text-white hover:bg-white/8">
              {collaborationPeers.length > 0
                ? `${collaborationPeers.length} live`
                : "Solo"}
            </Badge>
          </div>

          <div className="text-[11px] text-white/55">
            {collaborationErrorMessage ?? collaborationStatusLabel}
          </div>

          {collaborationPeers.length > 0 ? (
            <div className="space-y-2 border-white/10 border-t pt-3">
              {collaborationPeers.map((peer) => (
                <div
                  className="flex items-center gap-3 rounded-none border border-white/10 bg-black/10 px-3 py-2.5"
                  key={peer.identity.clientId}
                >
                  <CollaboratorAvatar
                    identity={peer.identity}
                    ringClassName="ring-2 ring-background"
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">
                      {peer.identity.name}
                    </p>
                    <p className="text-white/55">
                      {peer.accessRole === "viewer" ? "Viewer" : "Editor"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {formatPresenceCell(peer.activeCell) ? (
                      <Badge className="border-white/10 bg-white/8 font-mono text-[10px] text-white hover:bg-white/8">
                        {formatPresenceCell(peer.activeCell)}
                      </Badge>
                    ) : null}
                    <Badge className="border-white/10 bg-white/8 text-white hover:bg-white/8">
                      {peer.accessRole === "viewer" ? "Viewer" : "Editor"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface TransientStatusIndicatorProps {
  detail: string | null;
  statusLabel: string | null;
}

function TransientStatusIndicator({
  detail,
  statusLabel,
}: TransientStatusIndicatorProps) {
  if (!statusLabel) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-muted-foreground text-xs transition-colors hover:bg-accent">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground/10" />
            <span className="relative inline-flex size-2 rounded-full bg-muted-foreground/70" />
          </span>
          <span className="truncate">{statusLabel}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {detail ? `${statusLabel}: ${detail}` : statusLabel}
      </TooltipContent>
    </Tooltip>
  );
}

export function SpreadsheetMenuBar({
  activeFontFamily,
  activeFontSize,
  activeTextColor,
  boldActive,
  canEdit,
  canManualSync,
  canManageSharing,
  canRedo,
  canSortSelection,
  canUndo,
  collaborationAccessRole,
  collaborationErrorMessage,
  collaborationPeers,
  collaborationStatus,
  isGalleryOpen,
  isFavorite,
  italicActive,
  lastSyncErrorMessage,
  lastSyncedLabel,
  onCopy,
  onCreateWorkbook,
  onCut,
  onDeleteColumn,
  onDeleteRow,
  onDeleteWorkbook,
  onExportCsv,
  onExportExcel,
  onImportCsv,
  onImportExcel,
  onManualSync,
  onOpenFindReplace,
  onOpenWorkbook,
  onPaste,
  onRedo,
  onRenameWorkbook,
  onSetFontFamily,
  onSetFontSize,
  onSetTextColor,
  onSetTextTransform,
  onSortSelectionAscending,
  onSortSelectionDescending,
  onToggleFavorite,
  onUpdateSharingAccessRole,
  onUpdateSharingEnabled,
  onToggleGallery,
  onToggleBold,
  onToggleItalic,
  onToggleStrikethrough,
  onToggleUnderline,
  onUndo,
  recentWorkbooks,
  remoteSyncStatus,
  remoteVersion,
  saveState,
  sharingAccessRole,
  sharingEnabled,
  syncServerUrl,
  strikethroughActive,
  textTransform,
  transientStatusDetail,
  transientStatusLabel,
  underlineActive,
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
  const collaborationStatusLabel = getPresenceStatusLabel(collaborationStatus);

  return (
    <>
      <div
        className="flex shrink-0 flex-col border-border border-b bg-background"
        data-slot="menu-bar"
      >
        <div className="flex items-start gap-2 px-2 py-2 md:hidden">
          <Link
            aria-label="Back to home page"
            className="inline-flex size-8 shrink-0 items-center justify-center"
            href="/"
          >
            <Image
              alt="Papyrus logo"
              className="size-6"
              height={28}
              src="/apple-touch-icon.png"
              width={28}
            />
          </Link>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 items-center gap-1">
              {isRenamingWorkbook ? (
                <Input
                  autoFocus
                  className="h-8 w-full border-transparent px-1.5 py-0.5 font-medium text-sm shadow-none focus-visible:border-ring"
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
                  className="truncate rounded-sm px-1.5 py-0.5 font-medium text-sm transition-colors hover:bg-accent"
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
              <span className="truncate">
                {saveState === "saving" ? "Saving..." : remoteSyncLabel}
              </span>
              {lastSyncedLabel ? (
                <span className="truncate text-muted-foreground/80">
                  · Synced {lastSyncedLabel}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <ShareDialog
              accessRole={collaborationAccessRole ?? "editor"}
              canEdit={canEdit}
              canManageSharing={canManageSharing}
              collaborators={collaborationPeers}
              onUpdateSharingAccessRole={onUpdateSharingAccessRole}
              onUpdateSharingEnabled={onUpdateSharingEnabled}
              realtimeErrorMessage={collaborationErrorMessage}
              realtimeStatus={collaborationStatus}
              sharingAccessRole={sharingAccessRole}
              sharingEnabled={sharingEnabled}
              syncServerUrl={syncServerUrl}
              workbookId={workbookId}
              workbookName={workbookName}
            />

            <GoogleAuthDialog />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="Open workbook menu"
                  size="icon-sm"
                  variant="ghost"
                >
                  <ListIcon weight="bold" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72" sideOffset={8}>
                <DropdownMenuLabel>File</DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() => {
                    onCreateWorkbook();
                  }}
                >
                  New workbook
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    Recent workbooks
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64">
                    {recentWorkbooks.length > 0 ? (
                      recentWorkbooks.map((recentWorkbook) => (
                        <DropdownMenuItem
                          key={recentWorkbook.id}
                          onSelect={() => {
                            onOpenWorkbook(
                              recentWorkbook.id,
                              recentWorkbook.name
                            );
                          }}
                        >
                          <span className="truncate">
                            {recentWorkbook.name}
                          </span>
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <DropdownMenuItem disabled>
                        No recent spreadsheets
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem
                  disabled={!canEdit}
                  onSelect={() => {
                    setIsRenamingWorkbook(true);
                  }}
                >
                  Rename workbook
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    handlePrint();
                  }}
                >
                  Print
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!(canEdit && workbookId)}
                  onSelect={() => {
                    setIsDeleteDialogOpen(true);
                  }}
                  variant="destructive"
                >
                  Delete workbook
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Edit</DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={!canUndo}
                  onSelect={() => {
                    onUndo();
                  }}
                >
                  Undo
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canRedo}
                  onSelect={() => {
                    onRedo();
                  }}
                >
                  Redo
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canEdit}
                  onSelect={() => {
                    onCut();
                  }}
                >
                  Cut
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    onCopy();
                  }}
                >
                  Copy
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canEdit}
                  onSelect={() => {
                    onPaste();
                  }}
                >
                  Paste
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    onOpenFindReplace();
                  }}
                >
                  Find and replace
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canEdit}
                  onSelect={() => {
                    onDeleteRow();
                  }}
                >
                  Delete row
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canEdit}
                  onSelect={() => {
                    onDeleteColumn();
                  }}
                >
                  Delete column
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>View</DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() => {
                    onToggleGallery();
                  }}
                >
                  {isGalleryOpen ? "Hide templates" : "Show templates"}
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Help</DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() => {
                    setIsFunctionListDialogOpen(true);
                  }}
                >
                  Function list
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setIsAboutDialogOpen(true);
                  }}
                >
                  About Papyrus
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-border border-t px-2 py-1.5 md:hidden">
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

          <SyncStatusDropdown
            collaborationStatus={collaborationStatus}
            hasPendingChanges={hasPendingChanges}
            lastSyncErrorMessage={lastSyncErrorMessage}
            lastSyncedLabel={lastSyncedLabel}
            remoteSyncLabel={remoteSyncLabel}
            remoteVersion={remoteVersion}
            saveState={saveState}
          />

          <TransientStatusIndicator
            detail={transientStatusDetail}
            statusLabel={transientStatusLabel}
          />

          <PresenceDropdown
            collaborationErrorMessage={collaborationErrorMessage}
            collaborationPeers={collaborationPeers}
            collaborationStatusLabel={collaborationStatusLabel}
          />
        </div>

        <div className="hidden h-10 items-center gap-2 px-3 md:flex">
          <Link
            aria-label="Back to home page"
            className="inline-flex items-center justify-center"
            href="/"
          >
            <Image
              alt="Papyrus logo"
              className="size-6"
              height={28}
              src="/apple-touch-icon.png"
              width={28}
            />
          </Link>

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

            <SyncStatusDropdown
              collaborationStatus={collaborationStatus}
              hasPendingChanges={hasPendingChanges}
              lastSyncErrorMessage={lastSyncErrorMessage}
              lastSyncedLabel={lastSyncedLabel}
              remoteSyncLabel={remoteSyncLabel}
              remoteVersion={remoteVersion}
              saveState={saveState}
            />

            <TransientStatusIndicator
              detail={transientStatusDetail}
              statusLabel={transientStatusLabel}
            />
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            <PresenceDropdown
              collaborationErrorMessage={collaborationErrorMessage}
              collaborationPeers={collaborationPeers}
              collaborationStatusLabel={collaborationStatusLabel}
            />

            <Separator className="mx-1 h-5" orientation="vertical" />

            <ShareDialog
              accessRole={collaborationAccessRole ?? "editor"}
              canEdit={canEdit}
              canManageSharing={canManageSharing}
              collaborators={collaborationPeers}
              onUpdateSharingAccessRole={onUpdateSharingAccessRole}
              onUpdateSharingEnabled={onUpdateSharingEnabled}
              realtimeErrorMessage={collaborationErrorMessage}
              realtimeStatus={collaborationStatus}
              sharingAccessRole={sharingAccessRole}
              sharingEnabled={sharingEnabled}
              syncServerUrl={syncServerUrl}
              workbookId={workbookId}
              workbookName={workbookName}
            />

            <GoogleAuthDialog />
          </div>
        </div>

        <Menubar className="hidden h-7 border-0 bg-transparent px-2 md:flex">
          <FileMenu
            canEdit={canEdit}
            onCreateWorkbook={onCreateWorkbook}
            onExportCsv={onExportCsv}
            onExportExcel={onExportExcel}
            onImportCsv={onImportCsv}
            onImportExcel={onImportExcel}
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
          <FormatMenu
            activeFontFamily={activeFontFamily}
            activeFontSize={activeFontSize}
            activeTextColor={activeTextColor}
            boldActive={boldActive}
            canEdit={canEdit}
            italicActive={italicActive}
            onSetFontFamily={onSetFontFamily}
            onSetFontSize={onSetFontSize}
            onSetTextColor={onSetTextColor}
            onSetTextTransform={onSetTextTransform}
            onToggleBold={onToggleBold}
            onToggleItalic={onToggleItalic}
            onToggleStrikethrough={onToggleStrikethrough}
            onToggleUnderline={onToggleUnderline}
            strikethroughActive={strikethroughActive}
            textTransform={textTransform}
            underlineActive={underlineActive}
          />
          <DataMenu
            canSortSelection={canSortSelection}
            onSortSelectionAscending={onSortSelectionAscending}
            onSortSelectionDescending={onSortSelectionDescending}
          />
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
              This permanently removes `{workbookName}` from local browser
              storage, IndexedDB, and any synced cloud copies.
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
