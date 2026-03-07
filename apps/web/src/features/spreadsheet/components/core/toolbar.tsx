"use client";

import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  CellSignalFullIcon,
  PaintBrushIcon,
  PaintBucketIcon,
  PrinterIcon,
  RectangleIcon,
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
  canRedo: boolean;
  canUndo: boolean;
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

export function Toolbar({ canRedo, canUndo, onRedo, onUndo }: ToolbarProps) {
  return (
    <div
      className="flex h-9 shrink-0 items-center gap-0.5 border-border border-b bg-background px-2"
      data-slot="toolbar"
    >
      {/* Undo / Redo */}
      <ToolbarButton
        disabled={!canUndo}
        icon={<ArrowCounterClockwiseIcon weight="bold" />}
        label="Undo (Ctrl+Z)"
        onClick={onUndo}
      />
      <ToolbarButton
        disabled={!canRedo}
        icon={<ArrowClockwiseIcon weight="bold" />}
        label="Redo (Ctrl+Y)"
        onClick={onRedo}
      />
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
        icon={<TextBolderIcon weight="bold" />}
        label="Bold (Ctrl+B)"
      />
      <ToolbarButton
        icon={<TextItalicIcon weight="bold" />}
        label="Italic (Ctrl+I)"
      />
      <ToolbarButton
        icon={<TextUnderlineIcon weight="bold" />}
        label="Underline (Ctrl+U)"
      />
      <ToolbarButton
        icon={<TextStrikethroughIcon weight="bold" />}
        label="Strikethrough"
      />

      <Separator className="mx-1 h-5" orientation="vertical" />

      {/* Colors */}
      <ToolbarButton
        icon={
          <span className="flex flex-col items-center">
            <TextAaIcon className="size-3.5" weight="bold" />
            <span className="-mt-0.5 h-0.5 w-3.5 rounded-full bg-foreground" />
          </span>
        }
        label="Text color"
      />
      <ToolbarButton
        icon={<PaintBucketIcon weight="bold" />}
        label="Fill color"
      />

      <Separator className="mx-1 h-5" orientation="vertical" />

      {/* Alignment */}
      <ToolbarButton
        icon={<TextAlignLeftIcon weight="bold" />}
        label="Align left"
      />
      <ToolbarButton
        icon={<TextAlignCenterIcon weight="bold" />}
        label="Align center"
      />
      <ToolbarButton
        icon={<TextAlignRightIcon weight="bold" />}
        label="Align right"
      />

      <Separator className="mx-1 h-5" orientation="vertical" />

      {/* Merge / Borders */}
      <ToolbarButton
        icon={<CellSignalFullIcon weight="bold" />}
        label="Merge cells"
      />
      <ToolbarButton icon={<RectangleIcon weight="bold" />} label="Borders" />
    </div>
  );
}
