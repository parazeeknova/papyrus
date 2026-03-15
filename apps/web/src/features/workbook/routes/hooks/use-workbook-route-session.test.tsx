import { expect, mock, test } from "bun:test";
import { render, waitFor } from "@testing-library/react";

const closeWorkbookRouteSessionCalls: Array<{
  expectedSessionId?: number | null;
  isSharedSession?: boolean;
  requestedAccessRole?: string | null;
  workbookId: string;
}> = [];
const openWorkbookCalls: Array<{
  isSharedSession?: boolean;
  requestedAccessRole?: string | null;
  workbookId: string;
}> = [];

mock.module("@/web/features/workbook/store/workbook-store", () => ({
  useWorkbookStore: (
    selector: (state: {
      closeWorkbookRouteSession: (
        workbookId: string,
        isSharedSession?: boolean,
        requestedAccessRole?: string | null,
        expectedSessionId?: number | null
      ) => Promise<void>;
      openWorkbook: (
        workbookId: string,
        name?: string,
        isSharedSession?: boolean,
        requestedAccessRole?: string | null
      ) => Promise<number | null>;
    }) => unknown
  ) =>
    selector({
      closeWorkbookRouteSession: (
        workbookId: string,
        isSharedSession?: boolean,
        requestedAccessRole?: string | null,
        expectedSessionId?: number | null
      ) => {
        closeWorkbookRouteSessionCalls.push({
          expectedSessionId,
          isSharedSession,
          requestedAccessRole,
          workbookId,
        });
        return Promise.resolve();
      },
      openWorkbook: (
        workbookId: string,
        _name?: string,
        isSharedSession?: boolean,
        requestedAccessRole?: string | null
      ) => {
        openWorkbookCalls.push({
          isSharedSession,
          requestedAccessRole,
          workbookId,
        });
        return Promise.resolve(openWorkbookCalls.length);
      },
    }),
}));

const { useWorkbookRouteSession } = await import(
  `./use-workbook-route-session.ts?${Date.now()}`
);

function RouteSessionProbe(props: {
  isSharedSession: boolean;
  requestedAccessRole?: "editor" | "viewer" | null;
  workbookId: string;
}) {
  useWorkbookRouteSession({
    isSharedSession: props.isSharedSession,
    requestedAccessRole: props.requestedAccessRole ?? null,
    workbookId: props.workbookId,
  });

  return null;
}

test("opens and closes workbook route sessions when the route mode changes", async () => {
  closeWorkbookRouteSessionCalls.length = 0;
  openWorkbookCalls.length = 0;

  const { rerender } = render(
    <RouteSessionProbe
      isSharedSession={false}
      requestedAccessRole={null}
      workbookId="workbook-3"
    />
  );

  await waitFor(() => {
    expect(openWorkbookCalls).toContainEqual({
      isSharedSession: false,
      requestedAccessRole: null,
      workbookId: "workbook-3",
    });
  });

  rerender(
    <RouteSessionProbe
      isSharedSession
      requestedAccessRole="viewer"
      workbookId="workbook-3"
    />
  );

  await waitFor(() => {
    expect(closeWorkbookRouteSessionCalls).toContainEqual({
      expectedSessionId: 1,
      isSharedSession: false,
      requestedAccessRole: null,
      workbookId: "workbook-3",
    });
    expect(openWorkbookCalls).toContainEqual({
      isSharedSession: true,
      requestedAccessRole: "viewer",
      workbookId: "workbook-3",
    });
  });
});
