import { beforeEach, describe, expect, test } from "bun:test";
import {
  deleteWorkbookRegistryEntry,
  listWorkbookRegistryEntries,
  upsertWorkbookRegistryEntry,
} from "./workbook-registry";

const openRegistryDatabaseName = "papyrus-workbook-registry";

async function clearRegistry(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const deleteRequest = indexedDB.deleteDatabase(openRegistryDatabaseName);
    deleteRequest.onsuccess = () => resolve();
    deleteRequest.onerror = () => reject(deleteRequest.error);
    deleteRequest.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await clearRegistry();
});

describe("workbook-registry", () => {
  test("stores, sorts, and deletes workbook entries", async () => {
    await upsertWorkbookRegistryEntry({
      createdAt: "2026-03-13T00:00:00.000Z",
      id: "workbook-1",
      isFavorite: false,
      lastOpenedAt: "2026-03-13T01:00:00.000Z",
      name: "Budget",
      sharingAccessRole: "editor",
      sharingEnabled: false,
      updatedAt: "2026-03-13T01:00:00.000Z",
    });
    await upsertWorkbookRegistryEntry({
      createdAt: "2026-03-13T00:00:00.000Z",
      id: "workbook-2",
      isFavorite: true,
      lastOpenedAt: "2026-03-13T02:00:00.000Z",
      name: "Forecast",
      sharingAccessRole: "viewer",
      sharingEnabled: true,
      updatedAt: "2026-03-13T02:00:00.000Z",
    });

    expect(await listWorkbookRegistryEntries()).toEqual([
      expect.objectContaining({ id: "workbook-2", name: "Forecast" }),
      expect.objectContaining({ id: "workbook-1", name: "Budget" }),
    ]);

    await deleteWorkbookRegistryEntry("workbook-2");

    expect(await listWorkbookRegistryEntries()).toEqual([
      expect.objectContaining({ id: "workbook-1" }),
    ]);
  });

  test("rejects when indexeddb opening fails", async () => {
    const originalIndexedDb = globalThis.indexedDB;
    const openError = new DOMException("open failed", "AbortError");

    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {
        open() {
          const request = {} as IDBOpenDBRequest;

          queueMicrotask(() => {
            Object.defineProperty(request, "error", {
              configurable: true,
              value: openError,
            });
            request.onerror?.(new Event("error"));
          });

          return request;
        },
      },
    });

    await expect(listWorkbookRegistryEntries()).rejects.toBe(openError);

    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: originalIndexedDb,
    });
  });

  test("rejects when registry transactions or requests fail", async () => {
    const originalIndexedDb = globalThis.indexedDB;
    const transactionError = new DOMException(
      "transaction failed",
      "AbortError"
    );
    const requestError = new DOMException("request failed", "AbortError");
    const putError = new DOMException("put failed", "AbortError");
    const deleteError = new DOMException("delete failed", "AbortError");

    try {
      Object.defineProperty(globalThis, "indexedDB", {
        configurable: true,
        value: {
          open() {
            const openRequest = {} as IDBOpenDBRequest;

            queueMicrotask(() => {
              const database = {
                close() {
                  return undefined;
                },
                transaction(_storeName: string, mode: IDBTransactionMode) {
                  const transaction = {
                    error: null,
                    objectStore() {
                      return {
                        getAll() {
                          const request = {} as IDBRequest;

                          queueMicrotask(() => {
                            Object.defineProperty(request, "error", {
                              configurable: true,
                              value: requestError,
                            });
                            request.onerror?.(new Event("error"));
                          });

                          return request;
                        },
                        put() {
                          const request = {} as IDBRequest;

                          queueMicrotask(() => {
                            Object.defineProperty(request, "error", {
                              configurable: true,
                              value: putError,
                            });
                            request.onerror?.(new Event("error"));
                          });

                          return request;
                        },
                        delete() {
                          const request = {} as IDBRequest;

                          queueMicrotask(() => {
                            Object.defineProperty(request, "error", {
                              configurable: true,
                              value: deleteError,
                            });
                            request.onerror?.(new Event("error"));
                          });

                          return request;
                        },
                      } as unknown as IDBObjectStore;
                    },
                    oncomplete: null,
                    onerror: null,
                  } as unknown as IDBTransaction;

                  if (mode === "readonly") {
                    queueMicrotask(() => {
                      Object.defineProperty(transaction, "error", {
                        configurable: true,
                        value: transactionError,
                      });
                      transaction.onerror?.(new Event("error"));
                    });
                  }

                  return transaction;
                },
              } as unknown as IDBDatabase;

              Object.defineProperty(openRequest, "result", {
                configurable: true,
                value: database,
              });
              openRequest.onsuccess?.(new Event("success"));
            });

            return openRequest;
          },
        },
      });

      await expect(listWorkbookRegistryEntries()).rejects.toBe(
        transactionError
      );

      await expect(
        upsertWorkbookRegistryEntry({
          createdAt: "2026-03-13T00:00:00.000Z",
          id: "workbook-3",
          isFavorite: false,
          lastOpenedAt: "2026-03-13T03:00:00.000Z",
          name: "Pipeline",
          sharingAccessRole: "editor",
          sharingEnabled: false,
          updatedAt: "2026-03-13T03:00:00.000Z",
        })
      ).rejects.toBe(putError);

      await expect(deleteWorkbookRegistryEntry("workbook-3")).rejects.toBe(
        deleteError
      );
    } finally {
      Object.defineProperty(globalThis, "indexedDB", {
        configurable: true,
        value: originalIndexedDb,
      });
    }
  });
});
