import { expect, mock, test } from "bun:test";
import { render } from "@testing-library/react";

const loaderCalls: Array<{ ssr: boolean | undefined }> = [];

mock.module(
  "@/web/features/workbook/routes/components/workbook-page-client",
  () => ({
    WorkbookPageClient: (props: Record<string, unknown>) => (
      <div
        data-props={JSON.stringify(props)}
        data-testid="workbook-page-client"
      />
    ),
  })
);

mock.module("next/dynamic", () => ({
  default: (loader: () => Promise<unknown>, options?: { ssr?: boolean }) => {
    loaderCalls.push({ ssr: options?.ssr });
    loader().catch(() => undefined);

    return (props: Record<string, unknown>) => (
      <div
        data-props={JSON.stringify(props)}
        data-testid="workbook-page-client"
      />
    );
  },
}));

const { WorkbookPageShell } = await import(
  `./workbook-page-shell.tsx?${Date.now()}`
);

test("passes workbook route state to the client shell", () => {
  const { getByTestId } = render(
    <WorkbookPageShell
      isSharedSession
      requestedAccessRole="viewer"
      workbookId="workbook-1"
    />
  );

  expect(getByTestId("workbook-page-client").getAttribute("data-props")).toBe(
    JSON.stringify({
      isSharedSession: true,
      requestedAccessRole: "viewer",
      workbookId: "workbook-1",
    })
  );

  expect(loaderCalls).toEqual([{ ssr: false }]);
});
