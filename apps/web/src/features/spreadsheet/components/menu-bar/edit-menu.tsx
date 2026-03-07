"use client";

import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ClipboardTextIcon,
  ColumnsIcon,
  CopyIcon,
  MagnifyingGlassIcon,
  RowsIcon,
  ScissorsIcon,
} from "@phosphor-icons/react";
import {
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/web/components/ui/menubar";

interface EditMenuProps {
  canEdit: boolean;
  canRedo: boolean;
  canUndo: boolean;
  onCopy: () => void;
  onCut: () => void;
  onDeleteColumn: () => void;
  onDeleteRow: () => void;
  onOpenFindReplace: () => void;
  onPaste: () => void;
  onRedo: () => void;
  onUndo: () => void;
}

export function EditMenu({
  canEdit,
  canRedo,
  canUndo,
  onCopy,
  onCut,
  onDeleteColumn,
  onDeleteRow,
  onOpenFindReplace,
  onPaste,
  onRedo,
  onUndo,
}: EditMenuProps) {
  return (
    <MenubarMenu>
      <MenubarTrigger>Edit</MenubarTrigger>
      <MenubarContent>
        <MenubarItem disabled={!canUndo} onClick={onUndo}>
          <ArrowCounterClockwiseIcon weight="bold" />
          Undo <MenubarShortcut>Cmd+Z</MenubarShortcut>
        </MenubarItem>
        <MenubarItem disabled={!canRedo} onClick={onRedo}>
          <ArrowClockwiseIcon weight="bold" />
          Redo <MenubarShortcut>Cmd+Y</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem disabled={!canEdit} onClick={onCut}>
          <ScissorsIcon weight="bold" />
          Cut <MenubarShortcut>Cmd+X</MenubarShortcut>
        </MenubarItem>
        <MenubarItem onClick={onCopy}>
          <CopyIcon weight="bold" />
          Copy <MenubarShortcut>Cmd+C</MenubarShortcut>
        </MenubarItem>
        <MenubarItem disabled={!canEdit} onClick={onPaste}>
          <ClipboardTextIcon weight="bold" />
          Paste <MenubarShortcut>Cmd+V</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem onClick={onOpenFindReplace}>
          <MagnifyingGlassIcon weight="bold" />
          Find and replace <MenubarShortcut>Cmd+H</MenubarShortcut>
        </MenubarItem>
        <MenubarItem disabled={!canEdit} onClick={onDeleteRow}>
          <RowsIcon weight="bold" />
          Delete row
        </MenubarItem>
        <MenubarItem disabled={!canEdit} onClick={onDeleteColumn}>
          <ColumnsIcon weight="bold" />
          Delete column
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
