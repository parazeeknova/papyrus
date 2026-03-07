"use client";

import {
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/web/components/ui/menubar";

export function ToolsMenu() {
  return (
    <MenubarMenu>
      <MenubarTrigger>Tools</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>Notifications</MenubarItem>
        <MenubarItem>Macros</MenubarItem>
        <MenubarSeparator />
        <MenubarItem>Script editor</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
