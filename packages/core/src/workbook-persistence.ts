import { IndexeddbPersistence } from "y-indexeddb";
import type { Doc } from "yjs";

const WORKBOOK_NAMESPACE_PREFIX = "papyrus-workbook";

export function getWorkbookPersistenceName(workbookId: string): string {
  return `${WORKBOOK_NAMESPACE_PREFIX}:${workbookId}`;
}

export function attachWorkbookPersistence(
  workbookId: string,
  doc: Doc
): IndexeddbPersistence {
  return new IndexeddbPersistence(getWorkbookPersistenceName(workbookId), doc);
}

export function waitForWorkbookPersistence(
  persistence: IndexeddbPersistence
): Promise<void> {
  return new Promise((resolve) => {
    if (persistence.synced) {
      resolve();
      return;
    }

    const handleSynced = () => {
      persistence.off("synced", handleSynced);
      resolve();
    };

    persistence.on("synced", handleSynced);
  });
}
