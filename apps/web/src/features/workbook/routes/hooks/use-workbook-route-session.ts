"use client";

import type { CollaborationAccessRole } from "@papyrus/core/collaboration-types";
import { createLogger } from "@papyrus/logs";
import { useEffect } from "react";
import { useWorkbookStore } from "@/web/features/workbook/store/workbook-store";

const workbookRouteSessionLogger = createLogger({
  scope: "workbook-route-session",
});

interface UseWorkbookRouteSessionOptions {
  isSharedSession: boolean;
  requestedAccessRole: CollaborationAccessRole | null;
  workbookId: string;
}

export function useWorkbookRouteSession({
  isSharedSession,
  requestedAccessRole,
  workbookId,
}: UseWorkbookRouteSessionOptions): void {
  const closeWorkbookRouteSession = useWorkbookStore(
    (state) => state.closeWorkbookRouteSession
  );
  const openWorkbook = useWorkbookStore((state) => state.openWorkbook);

  useEffect(() => {
    let didCloseSession = false;
    let activeSessionId: number | null = null;

    const closeOpenedSession = (sessionId: number): void => {
      if (didCloseSession) {
        return;
      }

      didCloseSession = true;
      closeWorkbookRouteSession(
        workbookId,
        isSharedSession,
        requestedAccessRole,
        sessionId
      ).catch((error) => {
        workbookRouteSessionLogger.error(
          "Failed to close the workbook route session.",
          error
        );
      });
    };

    openWorkbook(workbookId, undefined, isSharedSession, requestedAccessRole)
      .then((sessionId) => {
        activeSessionId = sessionId;
      })
      .catch((error) => {
        workbookRouteSessionLogger.error(
          "Failed to open the workbook route session.",
          error
        );
      });

    return () => {
      if (activeSessionId !== null) {
        closeOpenedSession(activeSessionId);
      }
    };
  }, [
    closeWorkbookRouteSession,
    isSharedSession,
    openWorkbook,
    requestedAccessRole,
    workbookId,
  ]);
}
