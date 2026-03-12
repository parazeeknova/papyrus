/// <reference lib="dom" />

import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";

GlobalRegistrator.register();

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

afterEach(() => {
  cleanup();
});
