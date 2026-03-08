"use client";

import {
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@/web/components/ui/menubar";

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
          Sort selection A {">"} Z
        </MenubarItem>
        <MenubarItem
          disabled={!canSortSelection}
          onClick={onSortSelectionDescending}
        >
          Sort selection Z {">"} A
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
