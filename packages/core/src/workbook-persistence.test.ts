import { expect, test } from "bun:test";
import { IndexeddbPersistence } from "y-indexeddb";
import { Doc } from "yjs";
import {
  attachWorkbookPersistence,
  deleteWorkbookPersistence,
  getWorkbookPersistenceName,
  waitForWorkbookPersistence,
} from "./workbook-persistence";

class FakePersistence {
  synced = false;
  private readonly handlers = new Set<() => void>();

  emitSynced(): void {
    this.synced = true;

    for (const handler of this.handlers) {
      handler();
    }
  }

  off(_event: "synced", handler: () => void): void {
    this.handlers.delete(handler);
  }

  on(_event: "synced", handler: () => void): void {
    this.handlers.add(handler);
  }

  getHandlerCount(): number {
    return this.handlers.size;
  }
}

class StickyPersistence extends FakePersistence {
  override off(_event: "synced", _handler: () => void): void {
    // Keep the handler registered so duplicate emits exercise the settled guard.
  }
}

function asIndexedDbPersistence(
  persistence: FakePersistence
): IndexeddbPersistence {
  return persistence as unknown as IndexeddbPersistence;
}

test("waitForWorkbookPersistence resolves immediately when persistence is already synced", async () => {
  const persistence = new FakePersistence();
  persistence.emitSynced();

  await expect(
    waitForWorkbookPersistence(asIndexedDbPersistence(persistence))
  ).resolves.toBe(true);
});

test("waitForWorkbookPersistence resolves when the synced event fires", async () => {
  const persistence = new FakePersistence();
  const waitForSync = waitForWorkbookPersistence(
    asIndexedDbPersistence(persistence)
  );

  persistence.emitSynced();

  await expect(waitForSync).resolves.toBe(true);
  expect(persistence.getHandlerCount()).toBe(0);
});

test("ignores duplicate synced notifications after persistence settles", async () => {
  const persistence = new FakePersistence();
  const waitForSync = waitForWorkbookPersistence(
    asIndexedDbPersistence(persistence)
  );

  persistence.emitSynced();
  persistence.emitSynced();

  await expect(waitForSync).resolves.toBe(true);
  expect(persistence.getHandlerCount()).toBe(0);
});

test("ignores duplicate settle attempts after the promise is already resolved", async () => {
  const persistence = new StickyPersistence();
  const waitForSync = waitForWorkbookPersistence(
    asIndexedDbPersistence(persistence)
  );

  persistence.emitSynced();
  persistence.emitSynced();

  await expect(waitForSync).resolves.toBe(true);
});

test("waitForWorkbookPersistence times out and detaches the synced listener", async () => {
  const persistence = new FakePersistence();

  await expect(
    waitForWorkbookPersistence(asIndexedDbPersistence(persistence), {
      timeoutMs: 10,
    })
  ).resolves.toBe(false);
  expect(persistence.getHandlerCount()).toBe(0);
});

test("builds persistence names and attaches indexeddb persistence in the browser environment", async () => {
  const doc = new Doc();
  const persistence = attachWorkbookPersistence("workbook-1", doc);

  expect(getWorkbookPersistenceName("workbook-1")).toBe(
    "papyrus-workbook:workbook-1"
  );
  await expect(
    waitForWorkbookPersistence(persistence, {
      timeoutMs: 250,
    })
  ).resolves.toBe(true);

  await persistence.destroy();
  doc.destroy();
});

test("clears persisted workbook data and destroys the document", async () => {
  const doc = new Doc();
  const destroy = doc.destroy.bind(doc);
  let destroyed = false;

  doc.destroy = () => {
    destroyed = true;
    destroy();
  };

  await expect(
    deleteWorkbookPersistence("workbook-delete", doc)
  ).resolves.toBeUndefined();
  expect(destroyed).toBe(true);
});

test("destroys the document even when clearing persisted workbook data fails", async () => {
  const doc = new Doc();
  const destroy = doc.destroy.bind(doc);
  let destroyed = false;
  const originalClearData = IndexeddbPersistence.prototype.clearData;
  const clearError = new Error("clear failed");

  doc.destroy = () => {
    destroyed = true;
    destroy();
  };

  IndexeddbPersistence.prototype.clearData = function clearData() {
    return Promise.reject(clearError);
  };

  try {
    await expect(
      deleteWorkbookPersistence("workbook-delete-error", doc)
    ).rejects.toBe(clearError);
    expect(destroyed).toBe(true);
  } finally {
    IndexeddbPersistence.prototype.clearData = originalClearData;
  }
});
