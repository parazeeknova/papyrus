"use client";

import type {
  CollaborationAccessRole,
  CollaboratorPresence,
} from "@papyrus/core/collaboration-types";
import {
  CheckIcon,
  CopyIcon,
  EyeIcon,
  PencilSimpleIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/web/components/ui/dropdown-menu";
import { Input } from "@/web/components/ui/input";
import { CollaboratorAvatar } from "@/web/features/spreadsheet/components/collaboration/collaborator-avatar";
import { buildWorkbookShareLink } from "@/web/features/spreadsheet/lib/collaboration";

interface ShareDialogProps {
  accessRole: CollaborationAccessRole;
  canEdit: boolean;
  canManageSharing: boolean;
  collaborators: CollaboratorPresence[];
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
  const [origin, setOrigin] = useState("");
  const [didCopyLink, setDidCopyLink] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!didCopyLink) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setDidCopyLink(false);
    }, 1500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [didCopyLink]);

  const shareLink = useMemo(() => {
    if (!(origin && workbookId)) {
      return "";
    }

    return buildWorkbookShareLink(origin, workbookId);
  }, [origin, workbookId]);

  const visibleCollaborators = useMemo(() => {
    return [...collaborators].sort(
      (left, right) => right.updatedAt - left.updatedAt
    );
  }, [collaborators]);

  const copyLink = async (): Promise<void> => {
    if (!sharingEnabled || shareLink.length === 0) {
      return;
    }

    await navigator.clipboard.writeText(shareLink);
    setDidCopyLink(true);
  };

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button className="gap-1 text-xs" size="sm" variant="ghost">
          <PencilSimpleIcon className="size-3.5" weight="bold" />
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
              <p className="font-medium text-xs">Realtime collaboration</p>
              <p className="text-muted-foreground text-xs">
                {realtimeErrorMessage
                  ? realtimeErrorMessage
                  : syncServerUrl
                    ? realtimeStatus === "connected"
                      ? "Connected to the sync server."
                      : realtimeStatus === "connecting"
                        ? "Connecting to the sync server."
                        : "Sync server unreachable right now."
                    : "No sync server configured yet."}
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
                  Turn sharing on before sending a link.
                </p>
              </div>
              <Button
                disabled={!canManageSharing}
                onClick={() => {
                  onUpdateSharingEnabled(!sharingEnabled);
                }}
                size="sm"
                variant={sharingEnabled ? "default" : "outline"}
              >
                {sharingEnabled ? "Sharing on" : "Enable sharing"}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                disabled={!(canManageSharing && sharingEnabled)}
                onClick={() => {
                  onUpdateSharingAccessRole("viewer");
                }}
                variant={sharingAccessRole === "viewer" ? "default" : "outline"}
              >
                <EyeIcon className="mr-1 size-3.5" weight="bold" />
                Viewer
              </Button>
              <Button
                disabled={!(canManageSharing && sharingEnabled)}
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
                placeholder={
                  canManageSharing
                    ? "Enable sharing to generate a link"
                    : "Sign in as the owner to manage sharing"
                }
                readOnly
                value={sharingEnabled ? shareLink : ""}
              />
              <Button
                disabled={!sharingEnabled || shareLink.length === 0}
                onClick={() => {
                  copyLink().catch(() => undefined);
                }}
                variant="outline"
              >
                {didCopyLink ? (
                  <CheckIcon weight="bold" />
                ) : (
                  <CopyIcon weight="bold" />
                )}
                Copy
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
