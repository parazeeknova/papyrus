"use client";

import type {
  CollaborationAccessRole,
  CollaboratorPresence,
} from "@papyrus/core/collaboration-types";
import {
  EyeIcon,
  PencilSimpleIcon,
  ShareNetworkIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { CollaboratorAvatar } from "@/web/features/workbook/collaboration/components/collaborator-avatar";
import {
  buildWorkbookShareUrl,
  SHARING_BACKEND_READY,
} from "@/web/features/workbook/collaboration/lib/collaboration";
import { Badge } from "@/web/shared/ui/badge";
import { Button } from "@/web/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/web/shared/ui/dropdown-menu";
import { Input } from "@/web/shared/ui/input";

interface ShareDialogProps {
  accessRole: CollaborationAccessRole;
  canEdit: boolean;
  canManageSharing: boolean;
  collaborators: CollaboratorPresence[];
  isAuthenticated: boolean;
  isSharedSession: boolean;
  onUpdateSharingAccessRole: (accessRole: CollaborationAccessRole) => void;
  onUpdateSharingEnabled: (sharingEnabled: boolean) => void;
  realtimeErrorMessage: string | null;
  realtimeStatus: "connected" | "connecting" | "disconnected";
  sharingAccessRole: CollaborationAccessRole;
  sharingEnabled: boolean;
  syncServerUrl: string | null;
  workbookId: string | null;
  workbookName: string;
}

function buildPresenceLabel(peer: CollaboratorPresence): string {
  if (!peer.activeCell) {
    return "Browsing";
  }

  return `Selecting r${peer.activeCell.row + 1}, c${peer.activeCell.col + 1}`;
}

export function ShareDialog({
  accessRole,
  canManageSharing,
  canEdit,
  isAuthenticated,
  isSharedSession,
  collaborators,
  onUpdateSharingAccessRole,
  onUpdateSharingEnabled,
  realtimeErrorMessage,
  realtimeStatus,
  sharingAccessRole,
  sharingEnabled,
  syncServerUrl,
  workbookId,
  workbookName,
}: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy link");

  const visibleCollaborators = useMemo(() => {
    return [...collaborators].sort(
      (left, right) => right.updatedAt - left.updatedAt
    );
  }, [collaborators]);
  const isRealtimeBackendReady =
    syncServerUrl !== null && SHARING_BACKEND_READY;
  const canConfigureSharing = canManageSharing && isRealtimeBackendReady;
  const collaborationStatusMessage = realtimeErrorMessage
    ? realtimeErrorMessage
    : isAuthenticated
      ? isRealtimeBackendReady
        ? realtimeStatus === "connected"
          ? "Connected to the Phoenix collaboration server."
          : realtimeStatus === "connecting"
            ? "Connecting to the Phoenix collaboration server."
            : "The Phoenix collaboration server is unreachable right now."
        : "Configure the collaboration websocket URL to unlock sharing."
      : "Sign in with Google to unlock cloud sync and sharing.";
  const shareAccessHint = isAuthenticated
    ? canManageSharing
      ? isRealtimeBackendReady
        ? "Turn sharing on before sending a link."
        : "Sharing controls stay off until the collaboration URL is configured."
      : isSharedSession
        ? "You joined through a shared link. Only the owner can change its settings."
        : "Only the owner can change sharing settings for this workbook."
    : "Sign in with Google to unlock sharing controls.";
  const shareLinkPlaceholder = isAuthenticated
    ? canConfigureSharing
      ? "Enable sharing to generate a link"
      : canManageSharing
        ? "Share links stay disabled until the collaboration URL is ready"
        : "Only the owner can change or regenerate this link"
    : "Sign in with Google to unlock sharing";
  const shareLink = useMemo(() => {
    if (!(workbookId && typeof window !== "undefined")) {
      return "";
    }

    return buildWorkbookShareUrl(
      window.location.origin,
      workbookId,
      sharingAccessRole
    );
  }, [sharingAccessRole, workbookId]);

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button
          className="gap-1 text-xs"
          data-testid="share-workbook-trigger"
          size="sm"
          variant="ghost"
        >
          <ShareNetworkIcon className="size-3.5" weight="bold" />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-108 overflow-hidden p-0"
        sideOffset={8}
      >
        <div className="border-border border-b px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-sm">Share spreadsheet</p>
              <p className="text-muted-foreground text-xs/relaxed">
                {workbookName}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={canEdit ? "secondary" : "outline"}>
                {accessRole === "editor" ? "Editor access" : "Viewer access"}
              </Badge>
              <Button
                onClick={() => {
                  setOpen(false);
                }}
                size="icon-sm"
                variant="ghost"
              >
                <XIcon />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="flex items-center justify-between rounded-none border border-border bg-muted/30 px-3 py-2">
            <div>
              <p className="font-medium text-xs">Cloud collaboration</p>
              <p className="text-muted-foreground text-xs">
                {collaborationStatusMessage}
              </p>
            </div>
            <Badge
              variant={realtimeStatus === "connected" ? "secondary" : "outline"}
            >
              {realtimeStatus}
            </Badge>
          </div>

          <div className="space-y-3 border-border border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-xs">Share access</p>
                <p className="text-muted-foreground text-xs">
                  {shareAccessHint}
                </p>
              </div>
              <Button
                disabled={!canConfigureSharing}
                onClick={() => {
                  onUpdateSharingEnabled(!sharingEnabled);
                }}
                size="sm"
                variant={sharingEnabled ? "default" : "outline"}
              >
                {isRealtimeBackendReady
                  ? sharingEnabled
                    ? "Sharing on"
                    : "Enable sharing"
                  : "Sharing off"}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                disabled={!(canConfigureSharing && sharingEnabled)}
                onClick={() => {
                  onUpdateSharingAccessRole("viewer");
                }}
                variant={sharingAccessRole === "viewer" ? "default" : "outline"}
              >
                <EyeIcon className="mr-1 size-3.5" weight="bold" />
                Viewer
              </Button>
              <Button
                disabled={!(canConfigureSharing && sharingEnabled)}
                onClick={() => {
                  onUpdateSharingAccessRole("editor");
                }}
                variant={sharingAccessRole === "editor" ? "default" : "outline"}
              >
                <PencilSimpleIcon className="mr-1 size-3.5" weight="bold" />
                Editor
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-xs">Share link</p>
              <Badge variant="outline">
                {sharingAccessRole === "editor" ? "Can edit" : "Read only"}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Input
                data-testid="share-link-input"
                placeholder={shareLinkPlaceholder}
                readOnly
                value={sharingEnabled ? shareLink : ""}
              />
              <Button
                disabled={!(canConfigureSharing && sharingEnabled && shareLink)}
                onClick={() => {
                  if (!shareLink) {
                    return;
                  }

                  navigator.clipboard
                    .writeText(shareLink)
                    .then(() => {
                      setCopyLabel("Copied");
                    })
                    .catch(() => {
                      setCopyLabel("Retry copy");
                    });
                }}
                variant="outline"
              >
                {copyLabel}
              </Button>
            </div>
          </div>

          <div className="space-y-2 border-border border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-xs">Other people in this sheet</p>
              <Badge variant="outline">{visibleCollaborators.length}</Badge>
            </div>

            {visibleCollaborators.length > 0 ? (
              <div className="space-y-2">
                {visibleCollaborators.map((peer) => {
                  return (
                    <div
                      className="flex items-center gap-3 border border-border bg-background px-3 py-2"
                      key={peer.identity.clientId}
                    >
                      <CollaboratorAvatar identity={peer.identity} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-xs">
                            {peer.identity.name}
                          </p>
                          <Badge variant="outline">{peer.accessRole}</Badge>
                          {peer.identity.isAnonymous ? (
                            <Badge variant="secondary">Anonymous</Badge>
                          ) : null}
                        </div>
                        <p className="truncate text-muted-foreground text-xs">
                          {buildPresenceLabel(peer)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-start gap-2 border border-border bg-muted/20 px-3 py-2 text-muted-foreground text-xs">
                <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
                Waiting for someone else to join this workbook.
              </div>
            )}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
