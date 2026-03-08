import { WorkbookPageShell } from "./workbook-page-shell";

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
    <WorkbookPageShell
      isSharedSession={shared === "1"}
      requestedAccessRole={access === "viewer" ? "viewer" : "editor"}
      workbookId={workbookId}
    />
  );
}
