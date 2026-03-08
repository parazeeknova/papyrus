"use client";

import type { CellTextTransform } from "@papyrus/core/workbook-types";
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
import { useEffect, useState } from "react";
import { Button } from "@/web/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/web/components/ui/dropdown-menu";
import { Input } from "@/web/components/ui/input";
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
const TEXT_COLOR_OPTIONS = [
  { label: "Default", value: null },
  { label: "Slate", value: "#334155" },
  { label: "Crimson", value: "#b91c1c" },
  { label: "Amber", value: "#b45309" },
  { label: "Emerald", value: "#047857" },
  { label: "Blue", value: "#2563eb" },
  { label: "Violet", value: "#7c3aed" },
  { label: "Pink", value: "#db2777" },
] as const;
const DEFAULT_FONT_FAMILY = FONT_FAMILIES[0] ?? "Nunito Sans";
const DEFAULT_FONT_SIZE = 10;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 200;

interface ToolbarButtonProps {
  active?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

interface ToolbarProps {
  activeFontFamily: string | null;
  activeFontSize: number | null;
  activeTextColor: string | null;
  boldActive: boolean;
  canEdit: boolean;
  canRedo: boolean;
  canUndo: boolean;
  italicActive: boolean;
  loading?: boolean;
  onCopy: () => void;
  onCut: () => void;
  onDeleteColumn: () => void;
  onDeleteRow: () => void;
  onOpenFindReplace: () => void;
  onPaste: () => void;
  onRedo: () => void;
  onSetFontFamily: (fontFamily: string | null) => void;
  onSetFontSize: (fontSize: number | null) => void;
  onSetTextColor: (textColor: string | null) => void;
  onSetTextTransform: (textTransform: CellTextTransform | null) => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onToggleStrikethrough: () => void;
  onToggleUnderline: () => void;
  onUndo: () => void;
  strikethroughActive: boolean;
  textTransform: CellTextTransform | null;
  underlineActive: boolean;
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
  activeFontFamily,
  activeFontSize,
  activeTextColor,
  boldActive,
  canEdit,
  canRedo,
  canUndo,
  italicActive,
  loading = false,
  onCopy,
  onCut,
  onDeleteColumn,
  onDeleteRow,
  onOpenFindReplace,
  onPaste,
  onRedo,
  onSetFontFamily,
  onSetFontSize,
  onSetTextColor,
  onSetTextTransform,
  onToggleBold,
  onToggleItalic,
  onToggleStrikethrough,
  onToggleUnderline,
  onUndo,
  strikethroughActive,
  textTransform,
  underlineActive,
}: ToolbarProps) {
  const [fontSizeDraft, setFontSizeDraft] = useState(
    String(activeFontSize ?? DEFAULT_FONT_SIZE)
  );

  useEffect(() => {
    setFontSizeDraft(String(activeFontSize ?? DEFAULT_FONT_SIZE));
  }, [activeFontSize]);

  const commitFontSizeDraft = () => {
    const nextFontSize = Number(fontSizeDraft.trim());
    if (!Number.isFinite(nextFontSize)) {
      setFontSizeDraft(String(activeFontSize ?? DEFAULT_FONT_SIZE));
      return;
    }

    const clampedFontSize = Math.min(
      MAX_FONT_SIZE,
      Math.max(MIN_FONT_SIZE, Math.round(nextFontSize))
    );
    setFontSizeDraft(String(clampedFontSize));
    onSetFontSize(clampedFontSize);
  };

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
              disabled={loading || !canEdit}
              variant="outline"
            >
              <TextAaIcon className="size-3.5" weight="bold" />
              <span className="truncate">
                {activeFontFamily ?? DEFAULT_FONT_FAMILY}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-40">
            {FONT_FAMILIES.map((font) => (
              <DropdownMenuItem
                key={font}
                onSelect={() => {
                  onSetFontFamily(font);
                }}
                style={{ fontFamily: font }}
              >
                {font}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Font size */}
        <div className="flex items-center">
          <Input
            className="h-7 w-14 rounded-r-none border-r-0 px-2 text-center text-xs focus-visible:ring-0"
            disabled={loading || !canEdit}
            inputMode="numeric"
            onBlur={commitFontSizeDraft}
            onChange={(event) => {
              setFontSizeDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitFontSizeDraft();
              }

              if (event.key === "Escape") {
                event.preventDefault();
                setFontSizeDraft(String(activeFontSize ?? DEFAULT_FONT_SIZE));
              }
            }}
            value={fontSizeDraft}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="h-7 rounded-l-none border px-2"
                disabled={loading || !canEdit}
                variant="outline"
              >
                <TextAaIcon className="size-3.5" weight="bold" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-16">
              {FONT_SIZES.map((size) => (
                <DropdownMenuItem
                  key={size}
                  onSelect={() => {
                    setFontSizeDraft(String(size));
                    onSetFontSize(size);
                  }}
                >
                  {size}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Separator className="mx-1 h-5" orientation="vertical" />

        {/* Text formatting */}
        <ToolbarButton
          active={boldActive}
          disabled={loading || !canEdit}
          icon={<TextBolderIcon weight="bold" />}
          label="Bold (Ctrl+B)"
          onClick={onToggleBold}
        />
        <ToolbarButton
          active={italicActive}
          disabled={loading || !canEdit}
          icon={<TextItalicIcon weight="bold" />}
          label="Italic (Ctrl+I)"
          onClick={onToggleItalic}
        />
        <ToolbarButton
          active={underlineActive}
          disabled={loading || !canEdit}
          icon={<TextUnderlineIcon weight="bold" />}
          label="Underline (Ctrl+U)"
          onClick={onToggleUnderline}
        />
        <ToolbarButton
          active={strikethroughActive}
          disabled={loading || !canEdit}
          icon={<TextStrikethroughIcon weight="bold" />}
          label="Strikethrough"
          onClick={onToggleStrikethrough}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className={
                textTransform ? "bg-accent text-accent-foreground" : ""
              }
              disabled={loading || !canEdit}
              size="icon-sm"
              variant="ghost"
            >
              <TextAaIcon className="size-3.5" weight="bold" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-40">
            <DropdownMenuRadioGroup
              onValueChange={(value) => {
                onSetTextTransform(
                  value === "none" ? null : (value as CellTextTransform)
                );
              }}
              value={textTransform ?? "none"}
            >
              <DropdownMenuRadioItem value="none">
                Normal case
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="uppercase">
                Uppercase
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="lowercase">
                Lowercase
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator className="mx-1 h-5" orientation="vertical" />

        {/* Colors */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              disabled={loading || !canEdit}
              size="icon-sm"
              variant="ghost"
            >
              <span className="flex flex-col items-center">
                <TextAaIcon className="size-3.5" weight="bold" />
                <span
                  className="-mt-0.5 h-0.5 w-3.5 rounded-full"
                  style={{ backgroundColor: activeTextColor ?? "currentColor" }}
                />
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44">
            <DropdownMenuRadioGroup
              onValueChange={(value) => {
                onSetTextColor(value === "default" ? null : value);
              }}
              value={activeTextColor ?? "default"}
            >
              {TEXT_COLOR_OPTIONS.map((colorOption) => (
                <DropdownMenuRadioItem
                  key={colorOption.label}
                  value={colorOption.value ?? "default"}
                >
                  <span
                    className="size-3 rounded-full border border-border"
                    style={{
                      backgroundColor: colorOption.value ?? "transparent",
                    }}
                  />
                  {colorOption.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
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
