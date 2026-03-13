"use client";

import type { CollaborationAccessRole } from "@papyrus/core/collaboration-types";
import type { WorkbookMeta } from "@papyrus/core/workbook-types";
import { createLogger } from "@papyrus/logs";
import type { Channel } from "phoenix";
import { buildCloudSyncEventErrorMessage } from "@/web/features/workbook/cloud-sync/lib/cloud-workbook-errors";
import { ensurePhoenixSocketConnection } from "@/web/platform/phoenix/socket-client";
import {
  decodeBase64ToBinary,
  encodeBinaryToBase64,
} from "@/web/platform/phoenix/update-base64";

const CLOUD_WORKBOOKS_TOPIC = "cloud_workbooks";
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
  token: string;
  uid: string;
}

let activeConnection: CloudWorkbookChannelConnection | null = null;

function disconnectActiveConnection(): void {
  if (!activeConnection) {
    return;
  }

  const connection = activeConnection;
  activeConnection = null;

  try {
    connection.channel.leave();
  } finally {
    activeConnection = null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function normalizeChannelError(eventName: string, response: unknown): Error {
  if (isRecord(response) && typeof response.reason === "string") {
    return new Error(
      buildCloudSyncEventErrorMessage(eventName, response.reason)
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

async function ensureCloudWorkbookChannel(uid: string): Promise<Channel> {
  const socketConnection = await ensurePhoenixSocketConnection(uid);
  const { socket, token } = socketConnection;

  if (
    activeConnection &&
    activeConnection.uid === uid &&
    activeConnection.token === token
  ) {
    return activeConnection.ready;
  }

  disconnectActiveConnection();

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

  channel.onClose(() => {
    if (activeConnection?.channel === channel) {
      activeConnection = null;
    }
  });
  channel.onError((error: unknown) => {
    collabLogger.warn("Phoenix cloud sync channel error.", error);
  });

  activeConnection = {
    channel,
    ready,
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
    update: decodeBase64ToBinary(workbook.updateBase64),
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
      updateBase64: encodeBinaryToBase64(workbook.update),
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
