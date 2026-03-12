import { WorkbookPageShell } from "@/web/features/workbook/routes/components/workbook-page-shell";

interface WorkbookPageProps {
  params: Promise<{
    workbookId: string;
  }>;
}

export default async function WorkbookPage({ params }: WorkbookPageProps) {
  const { workbookId } = await params;

  return (
    <WorkbookPageShell
      // Shared-session routing stays off until Phoenix owns share authorization.
      isSharedSession={false}
      workbookId={workbookId}
    />
  );
}
