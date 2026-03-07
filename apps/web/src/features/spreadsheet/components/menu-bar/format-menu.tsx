"use client";

import {
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/web/components/ui/menubar";

export function FormatMenu() {
  return (
    <MenubarMenu>
      <MenubarTrigger>Format</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>
          Bold <MenubarShortcut>Cmd+B</MenubarShortcut>
        </MenubarItem>
        <MenubarItem>
          Italic <MenubarShortcut>Cmd+I</MenubarShortcut>
        </MenubarItem>
        <MenubarItem>
          Underline <MenubarShortcut>Cmd+U</MenubarShortcut>
        </MenubarItem>
        <MenubarSeparator />
        <MenubarSub>
          <MenubarSubTrigger>Number</MenubarSubTrigger>
          <MenubarSubContent>
            <MenubarItem>Automatic</MenubarItem>
            <MenubarItem>Plain text</MenubarItem>
            <MenubarItem>Number</MenubarItem>
            <MenubarItem>Percent</MenubarItem>
            <MenubarItem>Currency</MenubarItem>
            <MenubarItem>Date</MenubarItem>
          </MenubarSubContent>
        </MenubarSub>
        <MenubarSeparator />
        <MenubarItem>Conditional formatting</MenubarItem>
        <MenubarItem>Alternating colors</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
