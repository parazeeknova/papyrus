"use client";

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
          Function list
        </MenubarItem>
        <MenubarItem
          onSelect={() => {
            onOpenAbout();
          }}
        >
          About Papyrus
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
