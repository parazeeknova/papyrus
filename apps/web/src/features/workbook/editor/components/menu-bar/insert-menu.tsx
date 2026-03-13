"use client";

import { ColumnsIcon, RowsIcon } from "@phosphor-icons/react";
import {
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/web/shared/ui/menubar";

interface InsertMenuProps {
  canEdit: boolean;
  onInsertColumnLeft: () => void;
  onInsertColumnRight: () => void;
  onInsertRowAbove: () => void;
  onInsertRowBelow: () => void;
}

export function InsertMenu({
  canEdit,
  onInsertColumnLeft,
  onInsertColumnRight,
  onInsertRowAbove,
  onInsertRowBelow,
}: InsertMenuProps) {
  const menuItemClassName = "flex min-w-44 items-center gap-2";

  return (
    <MenubarMenu>
      <MenubarTrigger>Insert</MenubarTrigger>
      <MenubarContent>
        <MenubarItem
          className={menuItemClassName}
          disabled={!canEdit}
          onClick={onInsertRowAbove}
        >
          <RowsIcon weight="bold" />
          Row above
        </MenubarItem>
        <MenubarItem
          className={menuItemClassName}
          disabled={!canEdit}
          onClick={onInsertRowBelow}
        >
          <RowsIcon weight="bold" />
          Row below
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem
          className={menuItemClassName}
          disabled={!canEdit}
          onClick={onInsertColumnLeft}
        >
          <ColumnsIcon weight="bold" />
          Column left
        </MenubarItem>
        <MenubarItem
          className={menuItemClassName}
          disabled={!canEdit}
          onClick={onInsertColumnRight}
        >
          <ColumnsIcon weight="bold" />
          Column right
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
