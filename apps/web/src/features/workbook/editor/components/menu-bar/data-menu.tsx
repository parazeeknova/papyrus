"use client";

import { SortAscendingIcon, SortDescendingIcon } from "@phosphor-icons/react";
import {
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@/web/shared/ui/menubar";

interface DataMenuProps {
  canSortSelection: boolean;
  onSortSelectionAscending: () => void;
  onSortSelectionDescending: () => void;
}

export function DataMenu({
  canSortSelection,
  onSortSelectionAscending,
  onSortSelectionDescending,
}: DataMenuProps) {
  return (
    <MenubarMenu>
      <MenubarTrigger>Data</MenubarTrigger>
      <MenubarContent>
        <MenubarItem
          disabled={!canSortSelection}
          onClick={onSortSelectionAscending}
        >
          <SortAscendingIcon weight="bold" />
          Sort selection A {">"} Z
        </MenubarItem>
        <MenubarItem
          disabled={!canSortSelection}
          onClick={onSortSelectionDescending}
        >
          <SortDescendingIcon weight="bold" />
          Sort selection Z {">"} A
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
