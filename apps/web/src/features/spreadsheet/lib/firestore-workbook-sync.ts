import type { WorkbookMeta } from "@papyrus/core/workbook-types";
import { createLogger } from "@papyrus/logs";
import { FirebaseError } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  writeBatch,
} from "firebase/firestore";
import { firebaseDb } from "@/web/features/auth/lib/firebase-auth";

const WORKBOOK_CHUNK_SIZE = 600_000;
const SYNC_LEASE_DURATION_MS = 10_000;
const FIRESTORE_RETRY_ATTEMPTS = 3;
const FIRESTORE_RETRY_BASE_DELAY_MS = 500;
const firestoreSyncLogger = createLogger({ scope: "firestore-sync" });

export interface RemoteWorkbookState {
  activeSheetId: string | null;
  meta: WorkbookMeta;
  update: Uint8Array;
  version: number;
}

interface RemoteWorkbookDocument extends WorkbookMeta {
  activeSheetId: string | null;
  leaseExpiresAt?: number;
  leaseOwner?: string;
  snapshotChunkCount: number;
  snapshotId: string;
  version: number;
}

interface RemoteWorkbookChunk {
  data: string;
  index: number;
  snapshotId: string;
}

function getWorkbookRef(uid: string, workbookId: string) {
  return doc(firebaseDb, "users", uid, "workbooks", workbookId);
}

function getWorkbookChunksCollection(uid: string, workbookId: string) {
  return collection(getWorkbookRef(uid, workbookId), "chunks");
}

function encodeUpdateToBase64(update: Uint8Array): string {
  let binary = "";

  for (let index = 0; index < update.length; index += 0x80_00) {
    binary += String.fromCharCode(...update.subarray(index, index + 0x80_00));
  }

  return btoa(binary);
}

function decodeBase64ToUpdate(value: string): Uint8Array {
  const binary = atob(value);
  const result = new Uint8Array(binary.length);

  for (const [index, char] of Array.from(binary).entries()) {
    result[index] = char.charCodeAt(0);
  }

  return result;
}

function chunkString(value: string, chunkSize: number): string[] {
  const result: string[] = [];

  for (let index = 0; index < value.length; index += chunkSize) {
    result.push(value.slice(index, index + chunkSize));
  }

  return result;
}

function isRetryableFirestoreError(error: unknown): boolean {
  if (!(error instanceof FirebaseError)) {
    return false;
  }

  return [
    "aborted",
    "deadline-exceeded",
    "failed-precondition",
    "internal",
    "resource-exhausted",
    "unavailable",
  ].includes(error.code);
}

function waitForDelay(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function withFirestoreRetry<T>(
  label: string,
  operation: () => Promise<T>
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt += 1;
      if (
        attempt >= FIRESTORE_RETRY_ATTEMPTS ||
        !isRetryableFirestoreError(error)
      ) {
        throw error;
      }

      const delayMs = FIRESTORE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      firestoreSyncLogger.warn(
        `${label} failed with a retryable Firestore error. Retrying in ${delayMs}ms.`,
        error
      );
      await waitForDelay(delayMs);
    }
  }
}

export async function listRemoteWorkbooks(
  uid: string
): Promise<WorkbookMeta[]> {
  const snapshot = await withFirestoreRetry("listRemoteWorkbooks", () => {
    return getDocs(collection(firebaseDb, "users", uid, "workbooks"));
  });

  return snapshot.docs.flatMap((documentSnapshot) => {
    const data = documentSnapshot.data() as Partial<RemoteWorkbookDocument>;
    if (
      typeof data.id !== "string" ||
      typeof data.name !== "string" ||
      typeof data.createdAt !== "string" ||
      typeof data.updatedAt !== "string" ||
      typeof data.lastOpenedAt !== "string" ||
      typeof data.isFavorite !== "boolean"
    ) {
      return [];
    }

    return [
      {
        createdAt: data.createdAt,
        id: data.id,
        isFavorite: data.isFavorite,
        lastOpenedAt: data.lastOpenedAt,
        lastSyncedAt:
          typeof data.lastSyncedAt === "string" ? data.lastSyncedAt : null,
        name: data.name,
        remoteVersion: typeof data.version === "number" ? data.version : null,
        updatedAt: data.updatedAt,
      } satisfies WorkbookMeta,
    ];
  });
}

export async function readRemoteWorkbook(
  uid: string,
  workbookId: string
): Promise<RemoteWorkbookState | null> {
  const workbookSnapshot = await withFirestoreRetry(
    "readRemoteWorkbook:meta",
    async () => getDoc(getWorkbookRef(uid, workbookId))
  );
  if (!workbookSnapshot.exists()) {
    return null;
  }

  const data = workbookSnapshot.data() as Partial<RemoteWorkbookDocument>;
  if (
    typeof data.snapshotId !== "string" ||
    typeof data.snapshotChunkCount !== "number" ||
    typeof data.id !== "string" ||
    typeof data.name !== "string" ||
    typeof data.createdAt !== "string" ||
    typeof data.updatedAt !== "string" ||
    typeof data.lastOpenedAt !== "string" ||
    typeof data.isFavorite !== "boolean"
  ) {
    return null;
  }

  const chunksSnapshot = await withFirestoreRetry(
    "readRemoteWorkbook:chunks",
    async () =>
      getDocs(
        query(
          getWorkbookChunksCollection(uid, workbookId),
          orderBy("index", "asc")
        )
      )
  );
  const chunks = chunksSnapshot.docs
    .map(
      (chunkSnapshot) => chunkSnapshot.data() as Partial<RemoteWorkbookChunk>
    )
    .filter(
      (chunk): chunk is RemoteWorkbookChunk =>
        typeof chunk.data === "string" &&
        typeof chunk.index === "number" &&
        chunk.snapshotId === data.snapshotId
    )
    .sort((left, right) => left.index - right.index);

  if (chunks.length !== data.snapshotChunkCount) {
    return null;
  }

  return {
    activeSheetId:
      typeof data.activeSheetId === "string" ? data.activeSheetId : null,
    meta: {
      createdAt: data.createdAt,
      id: data.id,
      isFavorite: data.isFavorite,
      lastOpenedAt: data.lastOpenedAt,
      lastSyncedAt:
        typeof data.lastSyncedAt === "string" ? data.lastSyncedAt : null,
      name: data.name,
      remoteVersion: typeof data.version === "number" ? data.version : null,
      updatedAt: data.updatedAt,
    },
    update: decodeBase64ToUpdate(chunks.map((chunk) => chunk.data).join("")),
    version: typeof data.version === "number" ? data.version : 0,
  };
}

export function acquireWorkbookSyncLease(
  uid: string,
  workbookId: string,
  clientId: string
): Promise<boolean> {
  const workbookRef = getWorkbookRef(uid, workbookId);

  return withFirestoreRetry("acquireWorkbookSyncLease", () => {
    return runTransaction(firebaseDb, async (transaction) => {
      const snapshot = await transaction.get(workbookRef);
      const data = snapshot.exists()
        ? (snapshot.data() as Partial<RemoteWorkbookDocument>)
        : null;
      const now = Date.now();
      const leaseOwner = data?.leaseOwner;
      const leaseExpiresAt = data?.leaseExpiresAt ?? 0;
      const hasLease =
        !leaseOwner || leaseOwner === clientId || leaseExpiresAt <= now;

      if (!hasLease) {
        return false;
      }

      transaction.set(
        workbookRef,
        {
          leaseExpiresAt: now + SYNC_LEASE_DURATION_MS,
          leaseOwner: clientId,
        },
        { merge: true }
      );

      return true;
    });
  });
}

export async function writeRemoteWorkbook(
  uid: string,
  workbook: RemoteWorkbookState,
  clientId: string
): Promise<void> {
  await withFirestoreRetry("writeRemoteWorkbook", async () => {
    const workbookRef = getWorkbookRef(uid, workbook.meta.id);
    const chunksCollection = getWorkbookChunksCollection(uid, workbook.meta.id);
    const snapshotId = `${Date.now()}-${clientId}`;
    const encodedUpdate = encodeUpdateToBase64(workbook.update);
    const chunks = chunkString(encodedUpdate, WORKBOOK_CHUNK_SIZE);
    const existingChunks = await withFirestoreRetry(
      "writeRemoteWorkbook:chunks",
      async () => getDocs(chunksCollection)
    );
    const batch = writeBatch(firebaseDb);
    const nextVersion = workbook.version + 1;
    const lastSyncedAt = new Date().toISOString();

    batch.set(workbookRef, {
      ...workbook.meta,
      activeSheetId: workbook.activeSheetId,
      lastSyncedAt,
      leaseExpiresAt: Date.now() + SYNC_LEASE_DURATION_MS,
      leaseOwner: clientId,
      remoteVersion: nextVersion,
      snapshotChunkCount: chunks.length,
      snapshotId,
      version: nextVersion,
    } satisfies RemoteWorkbookDocument);

    for (const existingChunk of existingChunks.docs) {
      batch.delete(existingChunk.ref);
    }

    for (const [index, chunk] of chunks.entries()) {
      batch.set(doc(chunksCollection, index.toString().padStart(4, "0")), {
        data: chunk,
        index,
        snapshotId,
      } satisfies RemoteWorkbookChunk);
    }

    await batch.commit();
  });
}

export async function deleteRemoteWorkbook(
  uid: string,
  workbookId: string
): Promise<void> {
  await withFirestoreRetry("deleteRemoteWorkbook", async () => {
    const workbookRef = getWorkbookRef(uid, workbookId);
    const chunksSnapshot = await withFirestoreRetry(
      "deleteRemoteWorkbook:chunks",
      async () => getDocs(getWorkbookChunksCollection(uid, workbookId))
    );
    const batch = writeBatch(firebaseDb);

    for (const chunk of chunksSnapshot.docs) {
      batch.delete(chunk.ref);
    }

    batch.delete(workbookRef);
    await batch.commit();
  });
}
