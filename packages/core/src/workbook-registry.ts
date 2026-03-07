import type { WorkbookMeta } from "./workbook-types";

const REGISTRY_DATABASE_NAME = "papyrus-workbook-registry";
const REGISTRY_STORE_NAME = "workbooks";
const REGISTRY_DATABASE_VERSION = 1;

function openRegistryDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      REGISTRY_DATABASE_NAME,
      REGISTRY_DATABASE_VERSION
    );

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(REGISTRY_STORE_NAME)) {
        database.createObjectStore(REGISTRY_STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  return openRegistryDatabase().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(REGISTRY_STORE_NAME, mode);
        const store = transaction.objectStore(REGISTRY_STORE_NAME);

        transaction.oncomplete = () => {
          database.close();
        };

        transaction.onerror = () => {
          reject(transaction.error);
        };

        Promise.resolve(run(store)).then(resolve).catch(reject);
      })
  );
}

export function listWorkbookRegistryEntries(): Promise<WorkbookMeta[]> {
  return withStore("readonly", (store) => {
    return new Promise<WorkbookMeta[]>((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        const result = (request.result as WorkbookMeta[]).toSorted((a, b) =>
          b.lastOpenedAt.localeCompare(a.lastOpenedAt)
        );
        resolve(result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  });
}

export function upsertWorkbookRegistryEntry(
  entry: WorkbookMeta
): Promise<void> {
  return withStore("readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put(entry);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  });
}
