"use client";

import { XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Badge } from "@/web/shared/ui/badge";
import { Button } from "@/web/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/web/shared/ui/dialog";
import { Input } from "@/web/shared/ui/input";

interface FindReplaceDialogProps {
  onFindNext: (query: string, caseSensitive: boolean) => boolean;
  onOpenChange: (open: boolean) => void;
  onReplace: (
    query: string,
    replacement: string,
    caseSensitive: boolean
  ) => Promise<boolean>;
  onReplaceAll: (
    query: string,
    replacement: string,
    caseSensitive: boolean
  ) => Promise<number>;
  open: boolean;
}

export function FindReplaceDialog({
  onFindNext,
  onOpenChange,
  onReplace,
  onReplaceAll,
  open,
}: FindReplaceDialogProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    if (!open) {
      setStatusMessage("");
    }
  }, [open]);

  useEffect(() => {
    if (!(open && query.trim().length > 0)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const didFind = onFindNext(query, caseSensitive);
      setStatusMessage(didFind ? "Moved to next match." : "No match found.");
    }, 220);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [caseSensitive, onFindNext, open, query]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="dark top-20! right-5! left-auto! w-80 max-w-[calc(100%-2rem)] translate-x-0! translate-y-0! gap-0 overflow-hidden bg-popover p-0 text-popover-foreground shadow-md sm:max-w-none"
        overlayClassName="bg-transparent supports-backdrop-filter:backdrop-blur-none"
        showCloseButton={false}
      >
        <DialogHeader className="border-border border-b px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>Find and replace</DialogTitle>
              <DialogDescription>
                Search the active sheet and replace matching cells.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Active sheet</Badge>
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
          </div>
        </DialogHeader>

        <div className="space-y-4 px-4 py-4">
          <div className="space-y-2">
            <label
              className="font-bold text-[11px]"
              htmlFor="find-replace-query"
            >
              Find
            </label>
            <Input
              autoFocus
              id="find-replace-query"
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const didFind = onFindNext(query, caseSensitive);
                  setStatusMessage(
                    didFind ? "Moved to next match." : "No match found."
                  );
                }
              }}
              placeholder="Search text"
              value={query}
            />
          </div>

          <div className="space-y-2">
            <label
              className="font-bold text-[11px]"
              htmlFor="find-replace-replacement"
            >
              Replace with
            </label>
            <Input
              id="find-replace-replacement"
              onChange={(event) => {
                setReplacement(event.target.value);
              }}
              placeholder="Replacement text"
              value={replacement}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button
              className={
                caseSensitive ? "bg-accent text-accent-foreground" : ""
              }
              onClick={() => {
                setCaseSensitive((previous) => !previous);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Match case
            </Button>
            <p className="text-right text-muted-foreground text-xs">
              {statusMessage || "Searches only the current sheet."}
            </p>
          </div>
        </div>

        <DialogFooter className="border-border border-t px-4 py-3">
          <Button
            onClick={() => {
              const didFind = onFindNext(query, caseSensitive);
              setStatusMessage(
                didFind ? "Moved to next match." : "No match found."
              );
            }}
            variant="outline"
          >
            Find next
          </Button>
          <Button
            onClick={() => {
              onReplace(query, replacement, caseSensitive)
                .then((didReplace) => {
                  setStatusMessage(
                    didReplace ? "Replaced current match." : "No match found."
                  );
                })
                .catch(() => {
                  setStatusMessage("Replace failed.");
                });
            }}
            variant="outline"
          >
            Replace
          </Button>
          <Button
            onClick={() => {
              onReplaceAll(query, replacement, caseSensitive)
                .then((replacementCount) => {
                  setStatusMessage(
                    replacementCount > 0
                      ? `Replaced ${replacementCount} cell${replacementCount === 1 ? "" : "s"}.`
                      : "No match found."
                  );
                })
                .catch(() => {
                  setStatusMessage("Replace all failed.");
                });
            }}
          >
            Replace all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
