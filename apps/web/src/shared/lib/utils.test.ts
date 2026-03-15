import { expect, test } from "bun:test";
import { cn } from "./utils";

test("cn merges class values and resolves tailwind collisions", () => {
  expect(cn("px-2", undefined, ["text-sm"], "px-4", false)).toBe(
    "text-sm px-4"
  );
});
