import { expect, test } from "bun:test";
import type { IndexeddbPersistence } from "y-indexeddb";
import { waitForWorkbookPersistence } from "./workbook-persistence";

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

test("waitForWorkbookPersistence times out and detaches the synced listener", async () => {
  const persistence = new FakePersistence();

  await expect(
    waitForWorkbookPersistence(asIndexedDbPersistence(persistence), {
      timeoutMs: 10,
    })
  ).resolves.toBe(false);
  expect(persistence.getHandlerCount()).toBe(0);
});
