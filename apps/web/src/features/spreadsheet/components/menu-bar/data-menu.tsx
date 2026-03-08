"use client";

import {
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@/web/components/ui/menubar";

export function DataMenu() {
  return (
    <MenubarMenu>
      <MenubarTrigger>Data</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>Sort range A {">"} Z</MenubarItem>
        <MenubarItem>Sort range Z {">"} A</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
