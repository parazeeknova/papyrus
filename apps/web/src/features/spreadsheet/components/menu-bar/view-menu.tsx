"use client";

import {
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/web/components/ui/menubar";

export function ViewMenu() {
  return (
    <MenubarMenu>
      <MenubarTrigger>View</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>Freeze rows</MenubarItem>
        <MenubarItem>Freeze columns</MenubarItem>
        <MenubarSeparator />
        <MenubarItem>Gridlines</MenubarItem>
        <MenubarItem>Formula bar</MenubarItem>
        <MenubarSeparator />
        <MenubarItem>Zoom in</MenubarItem>
        <MenubarItem>Zoom out</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
