"use client";

import {
  CalendarIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
  ListChecksIcon,
  PlusIcon,
  TableIcon,
  UsersIcon,
} from "@phosphor-icons/react";

interface TemplateItem {
  color: string;
  icon: React.ReactNode;
  label: string;
}

const TEMPLATES: TemplateItem[] = [
  {
    icon: <PlusIcon className="size-6" weight="light" />,
    label: "Blank",
    color: "bg-muted",
  },
  {
    icon: <ListChecksIcon className="size-6" weight="duotone" />,
    label: "To-do list",
    color: "bg-chart-3",
  },
  {
    icon: <CurrencyDollarIcon className="size-6" weight="duotone" />,
    label: "Budget",
    color: "bg-chart-4",
  },
  {
    icon: <CalendarIcon className="size-6" weight="duotone" />,
    label: "Calendar",
    color: "bg-chart-2/20",
  },
  {
    icon: <ChartBarIcon className="size-6" weight="duotone" />,
    label: "Tracker",
    color: "bg-chart-1/20",
  },
  {
    icon: <UsersIcon className="size-6" weight="duotone" />,
    label: "CRM",
    color: "bg-chart-5/20",
  },
  {
    icon: <TableIcon className="size-6" weight="duotone" />,
    label: "Inventory",
    color: "bg-primary/10",
  },
];

export function TemplateGalleryPanel() {
  return (
    <div
      className="fade-in slide-in-from-top-1 shrink-0 animate-in border-border border-b bg-muted/30 px-4 py-3 duration-150"
      data-slot="template-gallery"
    >
      <p className="mb-2 font-medium text-foreground text-xs">
        Start a new spreadsheet
      </p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {TEMPLATES.map((template) => (
          <button
            className="group flex shrink-0 flex-col items-center gap-1.5"
            key={template.label}
            type="button"
          >
            <div
              className={`flex size-18 items-center justify-center rounded-md border border-border ${template.color} text-muted-foreground transition-all group-hover:border-primary/40 group-hover:text-foreground group-hover:shadow-sm`}
            >
              {template.icon}
            </div>
            <span className="max-w-18 truncate text-muted-foreground text-xs group-hover:text-foreground">
              {template.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
