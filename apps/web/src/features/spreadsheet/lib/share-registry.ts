"use client";

import type { CollaborationAccessRole } from "@papyrus/core/collaboration-types";
import type { WorkbookMeta } from "@papyrus/core/workbook-types";
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { firebaseDb } from "@/web/features/auth/lib/firebase-auth";

export interface SharedWorkbookAccess {
  accessRole: CollaborationAccessRole;
  ownerId: string;
  sharingEnabled: boolean;
  workbookId: string;
}

function getSharedWorkbookRef(workbookId: string) {
  return doc(firebaseDb, "sharedWorkbooks", workbookId);
}

export async function upsertSharedWorkbookAccess(
  ownerId: string,
  workbook: Pick<WorkbookMeta, "id" | "sharingAccessRole" | "sharingEnabled">
): Promise<void> {
  await setDoc(getSharedWorkbookRef(workbook.id), {
    accessRole: workbook.sharingAccessRole,
    ownerId,
    sharingEnabled: workbook.sharingEnabled,
    workbookId: workbook.id,
  } satisfies SharedWorkbookAccess);
}

export async function deleteSharedWorkbookAccess(
  workbookId: string
): Promise<void> {
  await deleteDoc(getSharedWorkbookRef(workbookId));
}
