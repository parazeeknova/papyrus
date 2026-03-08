import type { CollaborationAccessRole } from "@papyrus/core/collaboration-types";
import { FIREBASE_API_KEY, FIREBASE_PROJECT_ID, log } from "./config";
import type { SharedWorkbookAccess } from "./types";

function getFirestoreDocumentUrl(workbookId: string): string | null {
  if (!(FIREBASE_API_KEY && FIREBASE_PROJECT_ID)) {
    return null;
  }

  return `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/sharedWorkbooks/${encodeURIComponent(workbookId)}?key=${FIREBASE_API_KEY}`;
}

function getStringField(
  fields: Record<string, { stringValue?: string }>,
  key: string
): string | null {
  const value = fields[key];
  return typeof value?.stringValue === "string" ? value.stringValue : null;
}

function getBooleanField(
  fields: Record<string, { booleanValue?: boolean }>,
  key: string
): boolean | null {
  const value = fields[key];
  return typeof value?.booleanValue === "boolean" ? value.booleanValue : null;
}

export async function readSharedWorkbookAccess(
  workbookId: string
): Promise<SharedWorkbookAccess | null> {
  const documentUrl = getFirestoreDocumentUrl(workbookId);
  if (!documentUrl) {
    throw new Error("share-config-unavailable");
  }

  const response = await fetch(documentUrl);
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error("share-config-unavailable");
  }

  const payload = (await response.json()) as {
    fields?: Record<string, { booleanValue?: boolean; stringValue?: string }>;
  };
  const fields = payload.fields;
  if (!fields) {
    return null;
  }

  const accessRole = getStringField(fields, "accessRole");
  const ownerId = getStringField(fields, "ownerId");
  const sharingEnabled = getBooleanField(fields, "sharingEnabled");
  const storedWorkbookId = getStringField(fields, "workbookId");
  if (
    (accessRole !== "editor" && accessRole !== "viewer") ||
    !ownerId ||
    sharingEnabled === null ||
    !storedWorkbookId
  ) {
    return null;
  }

  return {
    accessRole,
    ownerId,
    sharingEnabled,
    workbookId: storedWorkbookId,
  };
}

export async function verifyOwnerAuthToken(
  authToken: string
): Promise<string | null> {
  if (!FIREBASE_API_KEY) {
    throw new Error("share-config-unavailable");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      body: JSON.stringify({ idToken: authToken }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    }
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    users?: Array<{ localId?: string }>;
  };

  return payload.users?.[0]?.localId ?? null;
}

export async function resolveAccessRole(
  workbookId: string,
  authToken?: string
): Promise<{
  accessRole: CollaborationAccessRole;
  isOwner: boolean;
}> {
  const sharedWorkbookAccess = await readSharedWorkbookAccess(workbookId);
  if (!sharedWorkbookAccess) {
    throw new Error("missing-share-config");
  }

  if (authToken) {
    const ownerId = await verifyOwnerAuthToken(authToken);
    if (ownerId === sharedWorkbookAccess.ownerId) {
      log.debug("owner authenticated", workbookId);
      return {
        accessRole: "editor",
        isOwner: true,
      };
    }
  }

  if (!sharedWorkbookAccess.sharingEnabled) {
    throw new Error("sharing-disabled");
  }

  return {
    accessRole: sharedWorkbookAccess.accessRole,
    isOwner: false,
  };
}
