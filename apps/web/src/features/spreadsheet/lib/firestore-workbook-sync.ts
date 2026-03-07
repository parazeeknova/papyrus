import type { WorkbookMeta } from "@papyrus/core/workbook-types";
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

export interface RemoteWorkbookState {
  activeSheetId: string | null;
  meta: WorkbookMeta;
  update: Uint8Array;
}

interface RemoteWorkbookDocument extends WorkbookMeta {
  activeSheetId: string | null;
  leaseExpiresAt?: number;
  leaseOwner?: string;
  snapshotChunkCount: number;
  snapshotId: string;
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

export async function listRemoteWorkbooks(
  uid: string
): Promise<WorkbookMeta[]> {
  const snapshot = await getDocs(
    collection(firebaseDb, "users", uid, "workbooks")
  );

  return snapshot.docs
    .map((documentSnapshot) => {
      const data = documentSnapshot.data() as Partial<RemoteWorkbookDocument>;
      if (
        typeof data.id !== "string" ||
        typeof data.name !== "string" ||
        typeof data.createdAt !== "string" ||
        typeof data.updatedAt !== "string" ||
        typeof data.lastOpenedAt !== "string" ||
        typeof data.isFavorite !== "boolean"
      ) {
        return null;
      }

      return {
        createdAt: data.createdAt,
        id: data.id,
        isFavorite: data.isFavorite,
        lastOpenedAt: data.lastOpenedAt,
        name: data.name,
        updatedAt: data.updatedAt,
      } satisfies WorkbookMeta;
    })
    .filter((workbook): workbook is WorkbookMeta => workbook !== null);
}

export async function readRemoteWorkbook(
  uid: string,
  workbookId: string
): Promise<RemoteWorkbookState | null> {
  const workbookSnapshot = await getDoc(getWorkbookRef(uid, workbookId));
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

  const chunksSnapshot = await getDocs(
    query(getWorkbookChunksCollection(uid, workbookId), orderBy("index", "asc"))
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

  if (chunks.length === 0 && data.snapshotChunkCount > 0) {
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
      name: data.name,
      updatedAt: data.updatedAt,
    },
    update: decodeBase64ToUpdate(chunks.map((chunk) => chunk.data).join("")),
  };
}

export function acquireWorkbookSyncLease(
  uid: string,
  workbookId: string,
  clientId: string
): Promise<boolean> {
  const workbookRef = getWorkbookRef(uid, workbookId);

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
}

export async function writeRemoteWorkbook(
  uid: string,
  workbook: RemoteWorkbookState,
  clientId: string
): Promise<void> {
  const workbookRef = getWorkbookRef(uid, workbook.meta.id);
  const chunksCollection = getWorkbookChunksCollection(uid, workbook.meta.id);
  const snapshotId = `${Date.now()}-${clientId}`;
  const encodedUpdate = encodeUpdateToBase64(workbook.update);
  const chunks = chunkString(encodedUpdate, WORKBOOK_CHUNK_SIZE);
  const existingChunks = await getDocs(chunksCollection);
  const batch = writeBatch(firebaseDb);

  batch.set(workbookRef, {
    ...workbook.meta,
    activeSheetId: workbook.activeSheetId,
    leaseExpiresAt: Date.now() + SYNC_LEASE_DURATION_MS,
    leaseOwner: clientId,
    snapshotChunkCount: chunks.length,
    snapshotId,
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
}

export async function deleteRemoteWorkbook(
  uid: string,
  workbookId: string
): Promise<void> {
  const workbookRef = getWorkbookRef(uid, workbookId);
  const chunksSnapshot = await getDocs(
    getWorkbookChunksCollection(uid, workbookId)
  );
  const batch = writeBatch(firebaseDb);

  for (const chunk of chunksSnapshot.docs) {
    batch.delete(chunk.ref);
  }

  batch.delete(workbookRef);
  await batch.commit();
}
