import type { WorkbookMeta } from "@papyrus/core/workbook-types";

function getTimestampValue(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function shouldHydrateLocalWorkbook(
  remoteWorkbook: WorkbookMeta,
  localWorkbook?: WorkbookMeta
): boolean {
  if (!localWorkbook) {
    return true;
  }

  return (
    getTimestampValue(localWorkbook.updatedAt) <
    getTimestampValue(remoteWorkbook.updatedAt)
  );
}

export function shouldUploadLocalWorkbook(
  localWorkbook: WorkbookMeta,
  remoteWorkbook?: WorkbookMeta
): boolean {
  if (!remoteWorkbook) {
    return true;
  }

  return (
    getTimestampValue(localWorkbook.updatedAt) >
    getTimestampValue(remoteWorkbook.updatedAt)
  );
}
