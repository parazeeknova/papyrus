"use client";

import type { CollaborationAccessRole } from "@papyrus/core/collaboration-types";
import dynamic from "next/dynamic";

const WorkbookPageClient = dynamic(
  () =>
    import("@/web/features/spreadsheet/components/workbook-page-client").then(
      (module) => module.WorkbookPageClient
    ),
  {
    ssr: false,
  }
);

interface WorkbookPageShellProps {
  isSharedSession: boolean;
  requestedAccessRole?: CollaborationAccessRole | null;
  workbookId: string;
}

export function WorkbookPageShell({
  isSharedSession,
  requestedAccessRole = null,
  workbookId,
}: WorkbookPageShellProps) {
  return (
    <WorkbookPageClient
      isSharedSession={isSharedSession}
      requestedAccessRole={requestedAccessRole}
      workbookId={workbookId}
    />
  );
}
