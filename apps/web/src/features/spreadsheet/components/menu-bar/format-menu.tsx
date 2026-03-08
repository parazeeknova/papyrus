"use client";

import type { CellTextTransform } from "@papyrus/core/workbook-types";
import {
  TextAaIcon,
  TextBolderIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
} from "@phosphor-icons/react";
import {
  MenubarCheckboxItem,
  MenubarContent,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/web/components/ui/menubar";
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  FONT_FAMILIES,
  FONT_SIZES,
  TEXT_COLOR_OPTIONS,
} from "@/web/features/spreadsheet/lib/format-options";

interface FormatMenuProps {
  activeFontFamily: string | null;
  activeFontSize: number | null;
  activeTextColor: string | null;
  boldActive: boolean;
  canEdit: boolean;
  italicActive: boolean;
  onSetFontFamily: (fontFamily: string | null) => void;
  onSetFontSize: (fontSize: number | null) => void;
  onSetTextColor: (textColor: string | null) => void;
  onSetTextTransform: (textTransform: CellTextTransform | null) => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onToggleStrikethrough: () => void;
  onToggleUnderline: () => void;
  strikethroughActive: boolean;
  textTransform: CellTextTransform | null;
  underlineActive: boolean;
}

export function FormatMenu({
  activeFontFamily,
  activeFontSize,
  activeTextColor,
  boldActive,
  canEdit,
  italicActive,
  onSetFontFamily,
  onSetFontSize,
  onSetTextColor,
  onSetTextTransform,
  onToggleBold,
  onToggleItalic,
  onToggleStrikethrough,
  onToggleUnderline,
  strikethroughActive,
  textTransform,
  underlineActive,
}: FormatMenuProps) {
  return (
    <MenubarMenu>
      <MenubarTrigger>Format</MenubarTrigger>
      <MenubarContent>
        <MenubarCheckboxItem
          checked={boldActive}
          disabled={!canEdit}
          onClick={onToggleBold}
        >
          <TextBolderIcon weight="bold" />
          Bold <MenubarShortcut>Cmd+B</MenubarShortcut>
        </MenubarCheckboxItem>
        <MenubarCheckboxItem
          checked={italicActive}
          disabled={!canEdit}
          onClick={onToggleItalic}
        >
          <TextItalicIcon weight="bold" />
          Italic <MenubarShortcut>Cmd+I</MenubarShortcut>
        </MenubarCheckboxItem>
        <MenubarCheckboxItem
          checked={underlineActive}
          disabled={!canEdit}
          onClick={onToggleUnderline}
        >
          <TextUnderlineIcon weight="bold" />
          Underline <MenubarShortcut>Cmd+U</MenubarShortcut>
        </MenubarCheckboxItem>
        <MenubarCheckboxItem
          checked={strikethroughActive}
          disabled={!canEdit}
          onClick={onToggleStrikethrough}
        >
          <TextStrikethroughIcon weight="bold" />
          Strikethrough
        </MenubarCheckboxItem>
        <MenubarSeparator />
        <MenubarSub>
          <MenubarSubTrigger disabled={!canEdit}>
            <TextAaIcon weight="bold" />
            Font family
          </MenubarSubTrigger>
          <MenubarSubContent>
            <MenubarRadioGroup
              onValueChange={onSetFontFamily}
              value={activeFontFamily ?? DEFAULT_FONT_FAMILY}
            >
              {FONT_FAMILIES.map((fontFamily) => (
                <MenubarRadioItem key={fontFamily} value={fontFamily}>
                  <span style={{ fontFamily }}>{fontFamily}</span>
                </MenubarRadioItem>
              ))}
            </MenubarRadioGroup>
          </MenubarSubContent>
        </MenubarSub>
        <MenubarSub>
          <MenubarSubTrigger disabled={!canEdit}>
            <TextAaIcon weight="bold" />
            Font size
          </MenubarSubTrigger>
          <MenubarSubContent>
            <MenubarRadioGroup
              onValueChange={(value) => {
                onSetFontSize(Number(value));
              }}
              value={String(activeFontSize ?? DEFAULT_FONT_SIZE)}
            >
              {FONT_SIZES.map((fontSize) => (
                <MenubarRadioItem key={fontSize} value={String(fontSize)}>
                  {fontSize}
                </MenubarRadioItem>
              ))}
            </MenubarRadioGroup>
          </MenubarSubContent>
        </MenubarSub>
        <MenubarSub>
          <MenubarSubTrigger disabled={!canEdit}>
            <TextAaIcon weight="bold" />
            Text case
          </MenubarSubTrigger>
          <MenubarSubContent>
            <MenubarRadioGroup
              onValueChange={(value) => {
                onSetTextTransform(
                  value === "none" ? null : (value as CellTextTransform)
                );
              }}
              value={textTransform ?? "none"}
            >
              <MenubarRadioItem value="none">Normal case</MenubarRadioItem>
              <MenubarRadioItem value="uppercase">Uppercase</MenubarRadioItem>
              <MenubarRadioItem value="lowercase">Lowercase</MenubarRadioItem>
            </MenubarRadioGroup>
          </MenubarSubContent>
        </MenubarSub>
        <MenubarSub>
          <MenubarSubTrigger disabled={!canEdit}>
            <TextAaIcon weight="bold" />
            Text color
          </MenubarSubTrigger>
          <MenubarSubContent>
            <MenubarRadioGroup
              onValueChange={(value) => {
                onSetTextColor(value === "default" ? null : value);
              }}
              value={activeTextColor ?? "default"}
            >
              {TEXT_COLOR_OPTIONS.map((colorOption) => (
                <MenubarRadioItem
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
                </MenubarRadioItem>
              ))}
            </MenubarRadioGroup>
          </MenubarSubContent>
        </MenubarSub>
      </MenubarContent>
    </MenubarMenu>
  );
}
