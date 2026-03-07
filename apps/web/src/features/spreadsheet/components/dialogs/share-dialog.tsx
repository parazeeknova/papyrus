"use client";

import {
  CopyIcon,
  GlobeHemisphereWestIcon,
  LockIcon,
  UserPlusIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/web/components/ui/dropdown-menu";
import { Input } from "@/web/components/ui/input";

const PREVIEW_SHARE_LINK = "https://papyrus.app/s/untitled-spreadsheet";

export function ShareDialog() {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button className="gap-1 text-xs" size="sm" variant="ghost">
          <LockIcon className="size-3.5" weight="bold" />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-96 overflow-hidden p-0"
        sideOffset={8}
      >
        <div className="border-border border-b px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-sm">Share spreadsheet</p>
              <p className="text-muted-foreground text-xs/relaxed">
                Preview the sharing flow before live collaboration ships.
              </p>
            </div>
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

        <div className="space-y-4 px-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-xs">Share link</p>
              <Badge variant="outline">Preview only</Badge>
            </div>
            <div className="flex gap-2">
              <Input readOnly value={PREVIEW_SHARE_LINK} />
              <Button disabled variant="outline">
                <CopyIcon weight="bold" />
                Copy link
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-start gap-3 border border-border bg-muted/40 px-3 py-2">
              <div className="mt-0.5 rounded-full bg-primary/10 p-1 text-primary">
                <GlobeHemisphereWestIcon className="size-4" weight="bold" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-xs">Anyone with the link</p>
                  <Badge variant="secondary">Viewer</Badge>
                </div>
                <p className="text-muted-foreground text-xs/relaxed">
                  Public link access UI is ready, but permissions are not wired
                  up yet.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 border border-border bg-background px-3 py-2">
              <div className="mt-0.5 rounded-full bg-chart-2/15 p-1 text-chart-2">
                <UserPlusIcon className="size-4" weight="bold" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-xs">Invite collaborators</p>
                  <Badge variant="outline">Coming soon</Badge>
                </div>
                <p className="text-muted-foreground text-xs/relaxed">
                  Email invites, role changes, and real-time presence will plug
                  into this panel later.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border border-border border-dashed bg-muted/30 px-3 py-2">
            <div>
              <p className="font-medium text-xs">Current access</p>
              <p className="text-muted-foreground text-xs">
                Only local usage is active right now.
              </p>
            </div>
            <div className="flex -space-x-2">
              <div className="flex size-7 items-center justify-center rounded-full bg-chart-1 font-semibold text-[10px] text-white ring-2 ring-background">
                Y
              </div>
              <div className="flex size-7 items-center justify-center rounded-full bg-chart-2 font-semibold text-[10px] text-white ring-2 ring-background">
                P
              </div>
            </div>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
