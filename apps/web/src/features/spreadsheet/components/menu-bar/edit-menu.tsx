"use client";

import {
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/web/components/ui/menubar";

export function EditMenu() {
  return (
    <MenubarMenu>
      <MenubarTrigger>Edit</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>
          Undo <MenubarShortcut>Cmd+Z</MenubarShortcut>
        </MenubarItem>
        <MenubarItem>
          Redo <MenubarShortcut>Cmd+Y</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem>
          Cut <MenubarShortcut>Cmd+X</MenubarShortcut>
        </MenubarItem>
        <MenubarItem>
          Copy <MenubarShortcut>Cmd+C</MenubarShortcut>
        </MenubarItem>
        <MenubarItem>
          Paste <MenubarShortcut>Cmd+V</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarItem>
          Find and replace <MenubarShortcut>Cmd+H</MenubarShortcut>
        </MenubarItem>
        <MenubarItem>Delete row</MenubarItem>
        <MenubarItem>Delete column</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
