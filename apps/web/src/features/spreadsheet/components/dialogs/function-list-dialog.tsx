"use client";

import { FunctionIcon, XIcon } from "@phosphor-icons/react";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/web/components/ui/dialog";

interface FunctionListDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const SUPPORTED_FUNCTIONS = [
  {
    description: "Adds numeric values across a range.",
    example: "=SUM(A1:A10)",
    name: "SUM",
  },
  {
    description: "Returns the arithmetic mean of a range.",
    example: "=AVERAGE(B1:B5)",
    name: "AVERAGE",
  },
  {
    description: "Finds the smallest numeric value in a range.",
    example: "=MIN(C1:C10)",
    name: "MIN",
  },
  {
    description: "Finds the largest numeric value in a range.",
    example: "=MAX(D1:D10)",
    name: "MAX",
  },
  {
    description: "Counts numeric cells in a range.",
    example: "=COUNT(E1:E10)",
    name: "COUNT",
  },
  {
    description: "Supports arithmetic with cell references.",
    example: "=A1+B1*2",
    name: "Arithmetic",
  },
] as const;

export function FunctionListDialog({
  onOpenChange,
  open,
}: FunctionListDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton={false}
      >
        <DialogHeader className="border-border border-b px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>Function list</DialogTitle>
              <DialogDescription>
                Supported formulas and expressions in the current Papyrus
                spreadsheet engine.
              </DialogDescription>
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
            <Badge variant="secondary">Built-in formulas</Badge>
            <Badge variant="outline">Ranges supported</Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {SUPPORTED_FUNCTIONS.map((item) => (
              <div
                className="space-y-2 border border-border bg-muted/30 px-3 py-3"
                key={item.name}
              >
                <div className="flex items-center gap-2">
                  <FunctionIcon className="size-4 text-primary" weight="fill" />
                  <p className="font-medium">{item.name}</p>
                </div>
                <p className="text-muted-foreground text-xs/relaxed">
                  {item.description}
                </p>
                <code className="block border border-border bg-background px-2 py-1 font-mono text-[11px]">
                  {item.example}
                </code>
              </div>
            ))}
          </div>

          <div className="border border-border border-dashed px-3 py-3 text-muted-foreground text-xs/relaxed">
            Invalid references return `#REF!`, unsupported expressions return
            `#ERR!`, and circular references return `#CIRC!`.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
