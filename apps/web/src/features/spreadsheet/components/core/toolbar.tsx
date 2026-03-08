"use client";

import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  CellSignalFullIcon,
  ClipboardTextIcon,
  ColumnsIcon,
  CopyIcon,
  DotsThreeIcon,
  MagnifyingGlassIcon,
  PaintBrushIcon,
  PaintBucketIcon,
  PrinterIcon,
  RectangleIcon,
  RowsIcon,
  ScissorsIcon,
  TextAaIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextBolderIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
} from "@phosphor-icons/react";
import { Button } from "@/web/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/web/components/ui/dropdown-menu";
import { Separator } from "@/web/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/web/components/ui/tooltip";

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
const FONT_FAMILIES = [
  "Nunito Sans",
  "Arial",
  "Courier New",
  "Georgia",
  "Times New Roman",
  "Verdana",
  "Trebuchet MS",
];

interface ToolbarButtonProps {
  active?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

interface ToolbarProps {
  canEdit: boolean;
  canRedo: boolean;
  canUndo: boolean;
  loading?: boolean;
  onCopy: () => void;
  onCut: () => void;
  onDeleteColumn: () => void;
  onDeleteRow: () => void;
  onOpenFindReplace: () => void;
  onPaste: () => void;
  onRedo: () => void;
  onUndo: () => void;
}

function ToolbarButton({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
}: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          className={active ? "bg-accent text-accent-foreground" : ""}
          disabled={disabled}
          onClick={onClick}
          size="icon-sm"
          variant="ghost"
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Toolbar({
  canEdit,
  canRedo,
  canUndo,
  loading = false,
  onCopy,
  onCut,
  onDeleteColumn,
  onDeleteRow,
  onOpenFindReplace,
  onPaste,
  onRedo,
  onUndo,
}: ToolbarProps) {
  return (
    <div
      className="relative shrink-0 border-border border-b bg-background"
      data-slot="toolbar"
    >
      <div className="flex items-center gap-0.5 overflow-x-auto px-2 py-1.5 md:hidden">
        <ToolbarButton
          disabled={loading || !canUndo}
          icon={<ArrowCounterClockwiseIcon weight="bold" />}
          label="Undo (Ctrl+Z)"
          onClick={onUndo}
        />
        <ToolbarButton
          disabled={loading || !canRedo}
          icon={<ArrowClockwiseIcon weight="bold" />}
          label="Redo (Ctrl+Y)"
          onClick={onRedo}
        />
        <ToolbarButton
          disabled={loading || !canEdit}
          icon={<ScissorsIcon weight="bold" />}
          label="Cut (Ctrl+X)"
          onClick={onCut}
        />
        <ToolbarButton
          disabled={loading}
          icon={<CopyIcon weight="bold" />}
          label="Copy (Ctrl+C)"
          onClick={onCopy}
        />
        <ToolbarButton
          disabled={loading || !canEdit}
          icon={<ClipboardTextIcon weight="bold" />}
          label="Paste (Ctrl+V)"
          onClick={onPaste}
        />
        <ToolbarButton
          disabled={loading}
          icon={<MagnifyingGlassIcon weight="bold" />}
          label="Find and replace (Ctrl+H)"
          onClick={onOpenFindReplace}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Open toolbar actions"
              disabled={loading}
              size="icon-sm"
              variant="ghost"
            >
              <DotsThreeIcon weight="bold" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
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
            <DropdownMenuItem>Print</DropdownMenuItem>
            <DropdownMenuItem>Format painter</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="hidden h-9 items-center gap-0.5 px-2 md:flex">
        {/* Undo / Redo */}
        <ToolbarButton
          disabled={loading || !canUndo}
          icon={<ArrowCounterClockwiseIcon weight="bold" />}
          label="Undo (Ctrl+Z)"
          onClick={onUndo}
        />
        <ToolbarButton
          disabled={loading || !canRedo}
          icon={<ArrowClockwiseIcon weight="bold" />}
          label="Redo (Ctrl+Y)"
          onClick={onRedo}
        />
        <ToolbarButton
          disabled={loading || !canEdit}
          icon={<ScissorsIcon weight="bold" />}
          label="Cut (Ctrl+X)"
          onClick={onCut}
        />
        <ToolbarButton
          disabled={loading}
          icon={<CopyIcon weight="bold" />}
          label="Copy (Ctrl+C)"
          onClick={onCopy}
        />
        <ToolbarButton
          disabled={loading || !canEdit}
          icon={<ClipboardTextIcon weight="bold" />}
          label="Paste (Ctrl+V)"
          onClick={onPaste}
        />
        <ToolbarButton
          disabled={loading}
          icon={<MagnifyingGlassIcon weight="bold" />}
          label="Find and replace (Ctrl+H)"
          onClick={onOpenFindReplace}
        />
        <ToolbarButton
          disabled={loading || !canEdit}
          icon={<RowsIcon weight="bold" />}
          label="Delete row"
          onClick={onDeleteRow}
        />
        <ToolbarButton
          disabled={loading || !canEdit}
          icon={<ColumnsIcon weight="bold" />}
          label="Delete column"
          onClick={onDeleteColumn}
        />
        <Separator className="mx-1 h-5" orientation="vertical" />
        <ToolbarButton
          icon={<PrinterIcon weight="bold" />}
          label="Print (Ctrl+P)"
        />
        <ToolbarButton
          icon={<PaintBrushIcon weight="bold" />}
          label="Format painter"
        />

        <Separator className="mx-1 h-5" orientation="vertical" />

        {/* Font family */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="h-7 w-28 justify-start gap-1 px-2 text-xs"
              disabled={loading}
              variant="outline"
            >
              <TextAaIcon className="size-3.5" weight="bold" />
              <span className="truncate">Nunito Sans</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-40">
            {FONT_FAMILIES.map((font) => (
              <DropdownMenuItem key={font} style={{ fontFamily: font }}>
                {font}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Font size */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="h-7 w-14 justify-center gap-0.5 px-2 text-xs"
              disabled={loading}
              variant="outline"
            >
              10
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-16">
            {FONT_SIZES.map((size) => (
              <DropdownMenuItem key={size}>{size}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator className="mx-1 h-5" orientation="vertical" />

        {/* Text formatting */}
        <ToolbarButton
          disabled={loading}
          icon={<TextBolderIcon weight="bold" />}
          label="Bold (Ctrl+B)"
        />
        <ToolbarButton
          disabled={loading}
          icon={<TextItalicIcon weight="bold" />}
          label="Italic (Ctrl+I)"
        />
        <ToolbarButton
          disabled={loading}
          icon={<TextUnderlineIcon weight="bold" />}
          label="Underline (Ctrl+U)"
        />
        <ToolbarButton
          disabled={loading}
          icon={<TextStrikethroughIcon weight="bold" />}
          label="Strikethrough"
        />

        <Separator className="mx-1 h-5" orientation="vertical" />

        {/* Colors */}
        <ToolbarButton
          disabled={loading}
          icon={
            <span className="flex flex-col items-center">
              <TextAaIcon className="size-3.5" weight="bold" />
              <span className="-mt-0.5 h-0.5 w-3.5 rounded-full bg-foreground" />
            </span>
          }
          label="Text color"
        />
        <ToolbarButton
          disabled={loading}
          icon={<PaintBucketIcon weight="bold" />}
          label="Fill color"
        />

        <Separator className="mx-1 h-5" orientation="vertical" />

        {/* Alignment */}
        <ToolbarButton
          disabled={loading}
          icon={<TextAlignLeftIcon weight="bold" />}
          label="Align left"
        />
        <ToolbarButton
          disabled={loading}
          icon={<TextAlignCenterIcon weight="bold" />}
          label="Align center"
        />
        <ToolbarButton
          disabled={loading}
          icon={<TextAlignRightIcon weight="bold" />}
          label="Align right"
        />

        <Separator className="mx-1 h-5" orientation="vertical" />

        {/* Merge / Borders */}
        <ToolbarButton
          disabled={loading}
          icon={<CellSignalFullIcon weight="bold" />}
          label="Merge cells"
        />
        <ToolbarButton
          disabled={loading}
          icon={<RectangleIcon weight="bold" />}
          label="Borders"
        />
      </div>

      {loading ? (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-border"
        >
          <div
            className="h-full w-40 bg-primary"
            style={{
              animation: "toolbar-loading-bar 1.4s ease-in-out infinite",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
