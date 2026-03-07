"use client";

import { Badge } from "@/web/components/ui/badge";
import { Input } from "@/web/components/ui/input";
import { Separator } from "@/web/components/ui/separator";
import type { CellPosition } from "@/web/features/spreadsheet/hooks/use-spreadsheet";

interface FormulaBarProps {
  activeCell: CellPosition | null;
  cellRaw: string;
  getCellReferenceLabel: (row: number, col: number) => string;
  onCommit: () => void;
  onValueChange: (value: string) => void;
  primaryColumnName: string;
}

export function FormulaBar({
  activeCell,
  cellRaw,
  getCellReferenceLabel,
  onValueChange,
  onCommit,
  primaryColumnName,
}: FormulaBarProps) {
  const cellLabel = activeCell
    ? getCellReferenceLabel(activeCell.row, activeCell.col)
    : "";

  return (
    <div
      className="flex h-8 shrink-0 items-center gap-1 border-border border-b bg-background px-2"
      data-slot="formula-bar"
    >
      <Badge
        className="flex h-6 w-14 items-center justify-center font-mono text-xs"
        variant="outline"
      >
        {cellLabel || "—"}
      </Badge>

      <Separator className="mx-1 h-5" orientation="vertical" />

      <span className="flex h-6 w-6 items-center justify-center text-muted-foreground text-xs italic">
        fx
      </span>

      <Input
        className="h-6 flex-1 border-none bg-transparent text-xs shadow-none focus-visible:ring-0"
        onChange={(e) => {
          onValueChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCommit();
          }
        }}
        placeholder={`Enter value or formula (e.g. =SUM(${primaryColumnName}1:${primaryColumnName}5))`}
        value={cellRaw}
      />
    </div>
  );
}
