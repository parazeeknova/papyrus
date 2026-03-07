import { WorkbookPageClient } from "@/web/features/spreadsheet/components/workbook-page-client";

interface WorkbookPageProps {
  params: Promise<{
    workbookId: string;
  }>;
  searchParams: Promise<{
    access?: string;
    shared?: string;
  }>;
}

export default async function WorkbookPage({
  params,
  searchParams,
}: WorkbookPageProps) {
  const { workbookId } = await params;
  const { access, shared } = await searchParams;

  return (
    <WorkbookPageClient
      isSharedSession={shared === "1"}
      requestedAccessRole={access === "viewer" ? "viewer" : "editor"}
      workbookId={workbookId}
    />
  );
}
