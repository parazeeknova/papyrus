"use client";

import {
  CornersInIcon,
  CornersOutIcon,
  FadersHorizontalIcon,
  GridFourIcon,
} from "@phosphor-icons/react";
import {
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/web/shared/ui/menubar";

interface ViewMenuProps {
  canZoomIn: boolean;
  canZoomOut: boolean;
  onToggleFormulaBar: () => void;
  onToggleGridlines: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  showFormulaBar: boolean;
  showGridlines: boolean;
  zoomLabel: string;
}

export function ViewMenu({
  canZoomIn,
  canZoomOut,
  onToggleFormulaBar,
  onToggleGridlines,
  onZoomIn,
  onZoomOut,
  showFormulaBar,
  showGridlines,
  zoomLabel,
}: ViewMenuProps) {
  return (
    <MenubarMenu>
      <MenubarTrigger>View</MenubarTrigger>
      <MenubarContent>
        <MenubarCheckboxItem
          checked={showGridlines}
          onClick={onToggleGridlines}
        >
          <GridFourIcon weight="bold" />
          Gridlines
        </MenubarCheckboxItem>
        <MenubarCheckboxItem
          checked={showFormulaBar}
          onClick={onToggleFormulaBar}
        >
          <FadersHorizontalIcon weight="bold" />
          Formula bar
        </MenubarCheckboxItem>
        <MenubarSeparator />
        <MenubarItem disabled={!canZoomIn} onClick={onZoomIn}>
          <CornersOutIcon weight="bold" />
          Zoom in
          <MenubarShortcut>{zoomLabel}</MenubarShortcut>
        </MenubarItem>
        <MenubarItem disabled={!canZoomOut} onClick={onZoomOut}>
          <CornersInIcon weight="bold" />
          Zoom out
          <MenubarShortcut>{zoomLabel}</MenubarShortcut>
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
