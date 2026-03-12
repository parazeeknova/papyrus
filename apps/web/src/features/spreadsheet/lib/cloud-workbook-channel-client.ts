"use client";

import type { CollaborationAccessRole } from "@papyrus/core/collaboration-types";
import type { WorkbookMeta } from "@papyrus/core/workbook-types";
import { createLogger } from "@papyrus/logs";
import { onAuthStateChanged } from "firebase/auth";
import { type Channel, Socket } from "phoenix";
import { env } from "@/web/env";
import { firebaseAuth } from "@/web/features/auth/lib/firebase-auth";

const CHANNEL_JOIN_TIMEOUT_MS = 10_000;
const CLOUD_WORKBOOKS_TOPIC = "cloud_workbooks";
const DEFAULT_COLLAB_PORT = 4000;
const DEVICE_ID_STORAGE_KEY = "papyrus-collab-device-id";
const collabLogger = createLogger({ scope: "cloud-workbook-channel" });

export interface ChannelRemoteWorkbookState {
  activeSheetId: string | null;
  meta: WorkbookMeta;
  updateBase64: string;
  version: number;
}

export interface CloudWorkbookWriteResult {
  lastSyncedAt: string;
  version: number;
}

interface CloudWorkbookChannelConnection {
  channel: Channel;
  ready: Promise<Channel>;
  socket: Socket;
  token: string;
  uid: string;
}

let activeConnection: CloudWorkbookChannelConnection | null = null;
let authListenerRegistered = false;
let fallbackDeviceId: string | null = null;

function assertSignedInUser(uid: string) {
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) {
    throw new Error("Google sign-in is required for cloud sync.");
  }

  if (currentUser.uid !== uid) {
    throw new Error("Cloud sync user mismatch.");
  }

  return currentUser;
}

function decodeBase64ToUpdate(value: string): Uint8Array {
  const binary = atob(value);
  const result = new Uint8Array(binary.length);

  for (const [index, char] of Array.from(binary).entries()) {
    result[index] = char.charCodeAt(0);
  }

  return result;
}

function disconnectActiveConnection(): void {
  if (!activeConnection) {
    return;
  }

  const connection = activeConnection;
  activeConnection = null;

  try {
    connection.channel.leave();
  } finally {
    connection.socket.disconnect();
  }
}

function encodeUpdateToBase64(update: Uint8Array): string {
  let binary = "";

  for (let index = 0; index < update.length; index += 0x80_00) {
    binary += String.fromCharCode(...update.subarray(index, index + 0x80_00));
  }

  return btoa(binary);
}

function getCollabWebSocketUrl(): string | null {
  if (env.NEXT_PUBLIC_COLLAB_WS_URL) {
    return env.NEXT_PUBLIC_COLLAB_WS_URL;
  }

  if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
    return null;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:${DEFAULT_COLLAB_PORT}/ws`;
}

function getOrCreateSocketDeviceId(): string {
  if (typeof window === "undefined") {
    fallbackDeviceId ??= crypto.randomUUID();
    return fallbackDeviceId;
  }

  const existingDeviceId = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existingDeviceId) {
    return existingDeviceId;
  }

  const nextDeviceId = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, nextDeviceId);
  return nextDeviceId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function normalizeChannelError(eventName: string, response: unknown): Error {
  if (isRecord(response) && typeof response.reason === "string") {
    return new Error(
      `Cloud sync request "${eventName}" failed: ${response.reason}.`
    );
  }

  return new Error(`Cloud sync request "${eventName}" failed.`);
}

function parseSharingAccessRole(
  value: unknown
): CollaborationAccessRole | null {
  return value === "editor" || value === "viewer" ? value : null;
}

function parseWorkbookMeta(value: unknown): WorkbookMeta | null {
  if (!isRecord(value)) {
    return null;
  }

  const sharingAccessRole = parseSharingAccessRole(value.sharingAccessRole);

  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    typeof value.lastOpenedAt !== "string" ||
    typeof value.isFavorite !== "boolean" ||
    !sharingAccessRole ||
    typeof value.sharingEnabled !== "boolean"
  ) {
    return null;
  }

  return {
    createdAt: value.createdAt,
    id: value.id,
    isFavorite: value.isFavorite,
    lastOpenedAt: value.lastOpenedAt,
    lastSyncedAt:
      typeof value.lastSyncedAt === "string" ? value.lastSyncedAt : null,
    name: value.name,
    remoteVersion:
      typeof value.remoteVersion === "number" ? value.remoteVersion : null,
    sharingAccessRole,
    sharingEnabled: value.sharingEnabled,
    updatedAt: value.updatedAt,
  };
}

function parseRemoteWorkbookState(
  value: unknown
): ChannelRemoteWorkbookState | null {
  if (!isRecord(value)) {
    return null;
  }

  const meta = parseWorkbookMeta(value.meta);
  if (
    !(
      meta &&
      (value.activeSheetId === null || typeof value.activeSheetId === "string")
    ) ||
    typeof value.updateBase64 !== "string" ||
    typeof value.version !== "number"
  ) {
    return null;
  }

  return {
    activeSheetId: value.activeSheetId,
    meta,
    updateBase64: value.updateBase64,
    version: value.version,
  };
}

function registerAuthListener() {
  if (authListenerRegistered || typeof window === "undefined") {
    return;
  }

  authListenerRegistered = true;
  onAuthStateChanged(firebaseAuth, (nextUser) => {
    if (nextUser) {
      return;
    }

    disconnectActiveConnection();
  });
}

async function ensureCloudWorkbookChannel(uid: string): Promise<Channel> {
  registerAuthListener();

  const currentUser = assertSignedInUser(uid);
  const token = await currentUser.getIdToken();
  const collabUrl = getCollabWebSocketUrl();

  if (!collabUrl) {
    throw new Error("The collaboration websocket URL is not configured.");
  }

  if (
    activeConnection &&
    activeConnection.uid === uid &&
    activeConnection.token === token
  ) {
    return activeConnection.ready;
  }

  disconnectActiveConnection();

  const socket = new Socket(collabUrl, {
    params: {
      device_id: getOrCreateSocketDeviceId(),
      token,
    },
    timeout: CHANNEL_JOIN_TIMEOUT_MS,
  });

  socket.connect();

  const channel = socket.channel(CLOUD_WORKBOOKS_TOPIC, {});
  const ready = new Promise<Channel>((resolve, reject) => {
    channel
      .join()
      .receive("ok", () => {
        resolve(channel);
      })
      .receive("error", (response: unknown) => {
        disconnectActiveConnection();
        reject(normalizeChannelError("join", response));
      })
      .receive("timeout", () => {
        disconnectActiveConnection();
        reject(new Error("Timed out connecting to the cloud sync channel."));
      });
  });

  socket.onClose(() => {
    if (activeConnection?.socket === socket) {
      activeConnection = null;
    }
  });

  socket.onError((error: unknown) => {
    collabLogger.warn("Phoenix cloud sync socket error.", error);
    if (activeConnection?.socket === socket) {
      activeConnection = null;
    }
  });

  activeConnection = {
    channel,
    ready,
    socket,
    token,
    uid,
  };

  return ready;
}

async function pushCloudWorkbookEvent<TResponse>(
  uid: string,
  eventName: string,
  payload: Record<string, unknown>
): Promise<TResponse> {
  const channel = await ensureCloudWorkbookChannel(uid);

  return new Promise<TResponse>((resolve, reject) => {
    channel
      .push(eventName, payload)
      .receive("ok", (response: unknown) => {
        resolve(response as TResponse);
      })
      .receive("error", (response: unknown) => {
        reject(normalizeChannelError(eventName, response));
      })
      .receive("timeout", () => {
        reject(new Error(`Cloud sync request "${eventName}" timed out.`));
      });
  });
}

export async function acquireRemoteWorkbookSyncLease(
  uid: string,
  workbookId: string,
  clientId: string
): Promise<boolean> {
  const response = await pushCloudWorkbookEvent<{ hasLease?: unknown }>(
    uid,
    "acquire_lease",
    {
      clientId,
      workbookId,
    }
  );

  if (typeof response.hasLease !== "boolean") {
    throw new Error("Cloud sync server returned an invalid lease response.");
  }

  return response.hasLease;
}

export async function deleteRemoteWorkbook(
  uid: string,
  workbookId: string
): Promise<void> {
  await pushCloudWorkbookEvent(uid, "delete", {
    workbookId,
  });
}

export async function listRemoteWorkbooks(
  uid: string
): Promise<WorkbookMeta[]> {
  const response = await pushCloudWorkbookEvent<{ workbooks?: unknown }>(
    uid,
    "list",
    {}
  );

  if (!Array.isArray(response.workbooks)) {
    throw new Error("Cloud sync server returned an invalid workbook list.");
  }

  return response.workbooks.flatMap((workbook) => {
    const parsedWorkbook = parseWorkbookMeta(workbook);
    return parsedWorkbook ? [parsedWorkbook] : [];
  });
}

export async function readRemoteWorkbook(
  uid: string,
  workbookId: string
): Promise<{
  activeSheetId: string | null;
  meta: WorkbookMeta;
  update: Uint8Array;
  version: number;
} | null> {
  const response = await pushCloudWorkbookEvent<{ workbook?: unknown }>(
    uid,
    "read",
    {
      workbookId,
    }
  );

  if (response.workbook == null) {
    return null;
  }

  const workbook = parseRemoteWorkbookState(response.workbook);
  if (!workbook) {
    throw new Error("Cloud sync server returned an invalid workbook snapshot.");
  }

  return {
    activeSheetId: workbook.activeSheetId,
    meta: workbook.meta,
    update: decodeBase64ToUpdate(workbook.updateBase64),
    version: workbook.version,
  };
}

export async function writeRemoteWorkbook(
  uid: string,
  workbook: {
    activeSheetId: string | null;
    meta: WorkbookMeta;
    update: Uint8Array;
    version: number;
  },
  clientId: string
): Promise<CloudWorkbookWriteResult> {
  const response = await pushCloudWorkbookEvent<{
    lastSyncedAt?: unknown;
    version?: unknown;
  }>(uid, "write", {
    clientId,
    workbook: {
      activeSheetId: workbook.activeSheetId,
      meta: workbook.meta,
      updateBase64: encodeUpdateToBase64(workbook.update),
      version: workbook.version,
    },
  });

  if (
    typeof response.lastSyncedAt !== "string" ||
    typeof response.version !== "number"
  ) {
    throw new Error("Cloud sync server returned an invalid write response.");
  }

  return {
    lastSyncedAt: response.lastSyncedAt,
    version: response.version,
  };
}
