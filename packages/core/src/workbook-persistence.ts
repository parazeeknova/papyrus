import { IndexeddbPersistence } from "y-indexeddb";
import type { Doc } from "yjs";

const WORKBOOK_NAMESPACE_PREFIX = "papyrus-workbook";
const DEFAULT_PERSISTENCE_SYNC_TIMEOUT_MS = 5000;

interface WorkbookPersistenceWaitOptions {
  timeoutMs?: number;
}

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
  persistence: IndexeddbPersistence,
  options: WorkbookPersistenceWaitOptions = {}
): Promise<boolean> {
  return new Promise((resolve) => {
    if (persistence.synced) {
      resolve(true);
      return;
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_PERSISTENCE_SYNC_TIMEOUT_MS;
    let hasSettled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const settle = (didSync: boolean) => {
      if (hasSettled) {
        return;
      }

      hasSettled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      persistence.off("synced", handleSynced);
      resolve(didSync);
    };

    const handleSynced = () => {
      settle(true);
    };

    persistence.on("synced", handleSynced);

    timeoutId = setTimeout(() => {
      settle(false);
    }, timeoutMs);
  });
}

export async function deleteWorkbookPersistence(
  workbookId: string,
  doc: Doc
): Promise<void> {
  const persistence = attachWorkbookPersistence(workbookId, doc);

  try {
    await waitForWorkbookPersistence(persistence);
    await persistence.clearData();
  } finally {
    doc.destroy();
  }
}
