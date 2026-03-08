"use client";

import { BookOpenIcon, FunctionIcon } from "@phosphor-icons/react";
import {
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@/web/components/ui/menubar";

interface HelpMenuProps {
  onOpenAbout: () => void;
  onOpenFunctionList: () => void;
}

export function HelpMenu({ onOpenAbout, onOpenFunctionList }: HelpMenuProps) {
  return (
    <MenubarMenu>
      <MenubarTrigger>Help</MenubarTrigger>
      <MenubarContent>
        <MenubarItem
          onSelect={() => {
            onOpenFunctionList();
          }}
        >
          <FunctionIcon weight="bold" />
          Function list
        </MenubarItem>
        <MenubarItem
          onSelect={() => {
            onOpenAbout();
          }}
        >
          <BookOpenIcon weight="bold" />
          About Papyrus
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
