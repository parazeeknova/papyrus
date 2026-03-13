import { parseWorkbookRouteAccess } from "@/web/features/workbook/collaboration/lib/collaboration";
import { WorkbookPageShell } from "@/web/features/workbook/routes/components/workbook-page-shell";

interface WorkbookPageProps {
  params: Promise<{
    workbookId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkbookPage({
  params,
  searchParams,
}: WorkbookPageProps) {
  const { workbookId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const { isSharedSession, requestedAccessRole } =
    parseWorkbookRouteAccess(resolvedSearchParams);
  const sessionKey = `${workbookId}:${isSharedSession ? (requestedAccessRole ?? "shared") : "owned"}`;

  return (
    <WorkbookPageShell
      isSharedSession={isSharedSession}
      key={sessionKey}
      requestedAccessRole={requestedAccessRole}
      workbookId={workbookId}
    />
  );
}
