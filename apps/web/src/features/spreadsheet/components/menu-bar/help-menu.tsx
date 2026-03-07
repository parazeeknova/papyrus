"use client";

import {
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/web/components/ui/menubar";

export function HelpMenu() {
  return (
    <MenubarMenu>
      <MenubarTrigger>Help</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>Search the menus</MenubarItem>
        <MenubarSeparator />
        <MenubarItem>Keyboard shortcuts</MenubarItem>
        <MenubarItem>Function list</MenubarItem>
        <MenubarSeparator />
        <MenubarItem>About Papyrus</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
