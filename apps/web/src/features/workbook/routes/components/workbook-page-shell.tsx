"use client";

import type { CollaborationAccessRole } from "@papyrus/core/collaboration-types";
import dynamic from "next/dynamic";

const WorkbookPageClient = dynamic(
  () =>
    import(
      "@/web/features/workbook/routes/components/workbook-page-client"
    ).then((module) => module.WorkbookPageClient),
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
  const sessionKey = `${workbookId}:${isSharedSession ? (requestedAccessRole ?? "shared") : "owned"}`;

  return (
    <WorkbookPageClient
      isSharedSession={isSharedSession}
      key={sessionKey}
      requestedAccessRole={requestedAccessRole}
      workbookId={workbookId}
    />
  );
}
