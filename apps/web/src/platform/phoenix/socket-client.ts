"use client";

import { createLogger } from "@papyrus/logs";
import { Socket } from "phoenix";
import {
  getCurrentAuthUser,
  onAuthStateChange,
} from "@/web/platform/auth/auth-client";
import { env } from "@/web/platform/env/client-env";

const DEFAULT_COLLAB_PORT = 4000;
const DEVICE_ID_STORAGE_KEY = "papyrus-collab-device-id";
const PHOENIX_CHANNEL_TIMEOUT_MS = 10_000;
const phoenixLogger = createLogger({ scope: "phoenix-socket" });

export interface PhoenixSocketConnection {
  deviceId: string;
  socket: Socket;
  token: string;
  uid: string;
}

let activeConnection: PhoenixSocketConnection | null = null;
let authListenerRegistered = false;
let fallbackDeviceId: string | null = null;

function assertSignedInUser(uid: string) {
  const currentUser = getCurrentAuthUser();
  if (!currentUser) {
    throw new Error("Google sign-in is required for cloud sync.");
  }

  if (currentUser.uid !== uid) {
    throw new Error("Cloud sync user mismatch.");
  }

  return currentUser;
}

function registerAuthListener(): void {
  if (authListenerRegistered || typeof window === "undefined") {
    return;
  }

  authListenerRegistered = true;
  onAuthStateChange((nextUser) => {
    if (nextUser) {
      return;
    }

    disconnectPhoenixSocket();
  });
}

export function disconnectPhoenixSocket(): void {
  if (!activeConnection) {
    return;
  }

  const connection = activeConnection;
  activeConnection = null;
  connection.socket.disconnect();
}

export function getCollabWebSocketUrl(): string | null {
  if (env.NEXT_PUBLIC_COLLAB_WS_URL) {
    return env.NEXT_PUBLIC_COLLAB_WS_URL;
  }

  if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
    return null;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:${DEFAULT_COLLAB_PORT}/ws`;
}

export function getOrCreateSocketDeviceId(): string {
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

export async function ensurePhoenixSocketConnection(
  uid: string
): Promise<PhoenixSocketConnection> {
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
    return activeConnection;
  }

  disconnectPhoenixSocket();

  const nextConnection: PhoenixSocketConnection = {
    deviceId: getOrCreateSocketDeviceId(),
    socket: new Socket(collabUrl, {
      params: {
        device_id: getOrCreateSocketDeviceId(),
        token,
      },
      timeout: PHOENIX_CHANNEL_TIMEOUT_MS,
    }),
    token,
    uid,
  };

  nextConnection.socket.connect();
  nextConnection.socket.onClose(() => {
    if (activeConnection?.socket === nextConnection.socket) {
      activeConnection = null;
    }
  });
  nextConnection.socket.onError((error: unknown) => {
    phoenixLogger.warn("Phoenix socket error.", error);
  });

  activeConnection = nextConnection;
  return nextConnection;
}

export { PHOENIX_CHANNEL_TIMEOUT_MS };
