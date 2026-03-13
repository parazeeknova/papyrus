/// <reference lib="dom" />

import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { IDBFactory, IDBKeyRange, indexedDB } from "fake-indexeddb";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "indexedDB", {
  configurable: true,
  value: indexedDB,
});
Object.defineProperty(globalThis, "IDBFactory", {
  configurable: true,
  value: IDBFactory,
});
Object.defineProperty(globalThis, "IDBKeyRange", {
  configurable: true,
  value: IDBKeyRange,
});

afterEach(() => {
  indexedDB.deleteDatabase("papyrus-workbook-registry");
});
