import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

test("renders tooltip primitives with the expected slots", () => {
  const view = render(
    <TooltipProvider delayDuration={25}>
      <Tooltip open>
        <TooltipTrigger asChild>
          <button type="button">Open</button>
        </TooltipTrigger>
        <TooltipContent sideOffset={8}>Tooltip body</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  expect(
    view.getByRole("button", { name: "Open" }).getAttribute("data-slot")
  ).toBe("tooltip-trigger");
  expect(view.getByRole("tooltip").textContent).toContain("Tooltip body");
  expect(
    document
      .querySelector('[data-slot="tooltip-content"]')
      ?.getAttribute("data-slot")
  ).toBe("tooltip-content");
});
