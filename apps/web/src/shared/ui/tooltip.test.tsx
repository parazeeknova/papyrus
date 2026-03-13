import { expect, mock, test } from "bun:test";
import { render } from "@testing-library/react";
import type * as React from "react";
import { cloneElement, isValidElement } from "react";

mock.module("radix-ui", () => ({
  Tooltip: {
    Arrow: (props: React.HTMLAttributes<HTMLDivElement>) => (
      <div data-testid="tooltip-arrow" {...props} />
    ),
    Content: ({
      children,
      sideOffset: _sideOffset,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      children: React.ReactNode;
      sideOffset?: number;
    }) => (
      <div role="tooltip" {...props}>
        {children}
      </div>
    ),
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Provider: ({
      children,
      delayDuration: _delayDuration,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      children: React.ReactNode;
      delayDuration?: number;
    }) => (
      <div data-testid="tooltip-provider" {...props}>
        {children}
      </div>
    ),
    Root: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      children: React.ReactNode;
    }) => (
      <div data-testid="tooltip-root" {...props}>
        {children}
      </div>
    ),
    Trigger: ({
      asChild,
      children,
      ...props
    }: React.HTMLAttributes<HTMLElement> & {
      asChild?: boolean;
      children: React.ReactNode;
    }) => {
      if (asChild && isValidElement(children)) {
        return cloneElement(children, props);
      }

      return (
        <button type="button" {...props}>
          {children}
        </button>
      );
    },
  },
}));

const { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } =
  await import("./tooltip");

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

  expect(view.getByTestId("tooltip-provider").getAttribute("data-slot")).toBe(
    "tooltip-provider"
  );
  expect(
    view.getByRole("button", { name: "Open" }).getAttribute("data-slot")
  ).toBe("tooltip-trigger");
  expect(view.getByRole("tooltip").textContent).toContain("Tooltip body");
  expect(view.getByRole("tooltip").getAttribute("data-slot")).toBe(
    "tooltip-content"
  );
  expect(view.getByTestId("tooltip-arrow")).not.toBeNull();
});
