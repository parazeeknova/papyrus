/// <reference lib="dom" />

import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { IDBFactory, IDBKeyRange, indexedDB } from "fake-indexeddb";
import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";

const setupFlag = Symbol.for("papyrus.bun-test-setup");

const globalState = globalThis as typeof globalThis & {
  [setupFlag]?: boolean;
};

if (!globalState[setupFlag]) {
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
  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      return {
        addEventListener: () => undefined,
        addListener: () => undefined,
        dispatchEvent: () => false,
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: () => undefined,
        removeListener: () => undefined,
      };
    },
  });

  globalState[setupFlag] = true;
}

afterEach(() => {
  cleanup();
  indexedDB.deleteDatabase("papyrus-workbook-registry");
});
