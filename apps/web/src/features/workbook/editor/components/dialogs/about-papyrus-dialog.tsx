"use client";

import {
  BookOpenIcon,
  GithubLogoIcon,
  LightningIcon,
  TableIcon,
  XIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import { Badge } from "@/web/shared/ui/badge";
import { Button } from "@/web/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/web/shared/ui/dialog";

interface AboutPapyrusDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function AboutPapyrusDialog({
  onOpenChange,
  open,
}: AboutPapyrusDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={false}
      >
        <DialogHeader className="border-border border-b px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Image
                alt="Papyrus logo"
                className="size-10 rounded-md ring-1 ring-border/60"
                height={40}
                src="/apple-touch-icon.png"
                width={40}
              />
              <div>
                <DialogTitle>About Papyrus</DialogTitle>
                <DialogDescription>
                  A local-first spreadsheet workspace built for fast, focused
                  editing.
                </DialogDescription>
              </div>
            </div>
            <Button
              onClick={() => {
                onOpenChange(false);
              }}
              size="icon-sm"
              variant="ghost"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-4 py-4 text-xs">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Preview</Badge>
            <Badge variant="outline">Spreadsheet workspace</Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2 border border-border bg-muted/40 px-3 py-3">
              <LightningIcon className="size-4 text-primary" weight="fill" />
              <div>
                <p className="font-medium">Fast editing</p>
                <p className="text-muted-foreground text-xs/relaxed">
                  Large visible sheets stay smooth with viewport virtualization.
                </p>
              </div>
            </div>

            <div className="space-y-2 border border-border bg-muted/40 px-3 py-3">
              <TableIcon className="size-4 text-primary" weight="fill" />
              <div>
                <p className="font-medium">Local persistence</p>
                <p className="text-muted-foreground text-xs/relaxed">
                  Workbooks are stored locally with IndexedDB-backed
                  persistence.
                </p>
              </div>
            </div>

            <div className="space-y-2 border border-border bg-muted/40 px-3 py-3">
              <BookOpenIcon className="size-4 text-primary" weight="fill" />
              <div>
                <p className="font-medium">Growing formula engine</p>
                <p className="text-muted-foreground text-xs/relaxed">
                  Core formulas, worker recalculation, and workbook UX are
                  already in place.
                </p>
              </div>
            </div>
          </div>

          <div className="border border-border border-dashed px-3 py-3 text-muted-foreground text-xs/relaxed">
            Papyrus is currently focused on delivering a clean spreadsheet
            experience first, then layering in richer sharing, collaboration,
            and formula capabilities.
          </div>

          <div className="space-y-2 border border-border bg-muted/30 px-3 py-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Author</Badge>
              <p className="font-medium text-foreground">Harsh Sahu</p>
            </div>
            <p className="text-muted-foreground text-xs/relaxed">
              Designed and built by Harsh Sahu. Follow ongoing work and updates
              on GitHub.
            </p>
            <a
              className="inline-flex items-center gap-2 font-medium text-primary text-xs underline-offset-4 hover:underline"
              href="https://github.com/parazeeknova"
              rel="noopener noreferrer"
              target="_blank"
            >
              <GithubLogoIcon className="size-4" weight="fill" />
              @parazeeknova
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
