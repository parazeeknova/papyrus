"use client";

import {
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/web/components/ui/menubar";

export function InsertMenu() {
  return (
    <MenubarMenu>
      <MenubarTrigger>Insert</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>Row above</MenubarItem>
        <MenubarItem>Row below</MenubarItem>
        <MenubarSeparator />
        <MenubarItem>Column left</MenubarItem>
        <MenubarItem>Column right</MenubarItem>
        <MenubarSeparator />
        <MenubarItem>Function</MenubarItem>
        <MenubarItem>Chart</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
