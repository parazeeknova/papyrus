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
const PHOENIX_CHANNEL_TIMEOUT_MS = 20_000;
const phoenixLogger = createLogger({ scope: "phoenix-socket" });

export interface PhoenixSocketConnection {
  deviceId: string;
  isGuest: boolean;
  socket: Socket;
  token: string | null;
  uid: string | null;
}

interface StoredConnection {
  deviceId: string;
  isGuest: boolean;
  socket: Socket;
  uid: string | null;
}

const GLOBAL_CONNECTION_KEY = "__papyrus_phoenix_connection" as const;

function getStoredConnection(): StoredConnection | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (window as unknown as Record<string, unknown>)[
    GLOBAL_CONNECTION_KEY
  ] as StoredConnection | null;
}

function setStoredConnection(connection: StoredConnection | null): void {
  if (typeof window === "undefined") {
    return;
  }
  (window as unknown as Record<string, unknown>)[GLOBAL_CONNECTION_KEY] =
    connection;
}

export function getActiveConnection(): PhoenixSocketConnection | null {
  const stored = getStoredConnection();
  if (!stored) {
    return null;
  }
  return stored as PhoenixSocketConnection;
}

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

    if (getActiveConnection()?.isGuest) {
      return;
    }

    disconnectPhoenixSocket();
  });
}

export function disconnectPhoenixSocket(): void {
  const connection = getStoredConnection();
  if (!connection) {
    return;
  }

  setStoredConnection(null);
  connection.socket.disconnect();
}

export function getCollabWebSocketUrl(): string | null {
  if (env.NEXT_PUBLIC_COLLAB_WS_URL) {
    return env.NEXT_PUBLIC_COLLAB_WS_URL;
  }

  // Turbopack may not inline env vars accessed via runtimeEnv object literals
  // in @t3-oss/env-nextjs. Fall back to a direct process.env check which
  // Turbopack CAN inline as a static property access.
  const directEnvValue = process.env.NEXT_PUBLIC_COLLAB_WS_URL;
  if (directEnvValue) {
    return directEnvValue;
  }

  if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
    return null;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:${DEFAULT_COLLAB_PORT}/ws`;
}

export function getCollabWebSocketUrlDebug(): {
  rawEnv: string | undefined;
  resolvedUrl: string | null;
  hasWindow: boolean;
} {
  return {
    rawEnv: process.env.NEXT_PUBLIC_COLLAB_WS_URL,
    resolvedUrl: getCollabWebSocketUrl(),
    hasWindow: typeof window !== "undefined",
  };
}

export function getOrCreateSocketDeviceId(): string {
  if (typeof window === "undefined") {
    fallbackDeviceId ??= crypto.randomUUID();
    return fallbackDeviceId;
  }

  try {
    const existingDeviceId = window.sessionStorage.getItem(
      DEVICE_ID_STORAGE_KEY
    );
    if (existingDeviceId) {
      return existingDeviceId;
    }

    const nextDeviceId = crypto.randomUUID();
    window.sessionStorage.setItem(DEVICE_ID_STORAGE_KEY, nextDeviceId);
    return nextDeviceId;
  } catch {
    fallbackDeviceId ??= crypto.randomUUID();
    return fallbackDeviceId;
  }
}

export async function ensurePhoenixSocketConnection(
  uid: string | null
): Promise<PhoenixSocketConnection> {
  registerAuthListener();
  const collabUrl = getCollabWebSocketUrl();
  const deviceId = getOrCreateSocketDeviceId();
  const isGuest = uid === null;

  phoenixLogger.info("Ensuring Phoenix socket connection...", {
    collabUrl,
    deviceId,
    isGuest,
    uid,
  });

  if (!collabUrl) {
    throw new Error("The collaboration websocket URL is not configured.");
  }

  let token: string | null = null;
  let params: Record<string, string | boolean> = {
    device_id: deviceId,
  };

  if (uid === null) {
    params = {
      ...params,
      guest: true,
    };
    phoenixLogger.info("Connecting as guest", { deviceId });
  } else {
    try {
      const currentUser = assertSignedInUser(uid);
      token = await currentUser.getIdToken();
      params = {
        ...params,
        token,
      };
      phoenixLogger.info("Connecting as authenticated user", {
        uid,
        hasToken: !!token,
        tokenLength: token?.length,
      });
    } catch (error) {
      phoenixLogger.error("Failed to get auth token", { error });
      throw error;
    }
  }

  const existingConnection = getStoredConnection();
  if (
    existingConnection &&
    existingConnection.isGuest === isGuest &&
    existingConnection.uid === uid
  ) {
    phoenixLogger.info("Reusing existing socket connection");
    // Return the stored connection augmented with the current token
    // (token is not stored on window to avoid credential exposure).
    return { ...existingConnection, token } as PhoenixSocketConnection;
  }

  phoenixLogger.info("Creating new socket connection...", { collabUrl });
  disconnectPhoenixSocket();

  const wsTransport = typeof WebSocket === "undefined" ? undefined : WebSocket;

  const socket = new Socket(collabUrl, {
    params,
    timeout: PHOENIX_CHANNEL_TIMEOUT_MS,
    ...(wsTransport ? { transport: wsTransport } : {}),
  });

  // Store non-sensitive fields on window for HMR persistence.
  // Token stays in the closure scope only.
  const storedConnection: StoredConnection = {
    deviceId,
    isGuest,
    socket,
    uid,
  };

  const nextConnection: PhoenixSocketConnection = {
    ...storedConnection,
    token,
  };

  phoenixLogger.info("Connecting socket...");
  nextConnection.socket.connect();

  nextConnection.socket.onClose(() => {
    phoenixLogger.info("Phoenix socket closed");
    const current = getStoredConnection();
    if (current?.socket === nextConnection.socket) {
      setStoredConnection(null);
    }
  });

  nextConnection.socket.onError((error: unknown) => {
    phoenixLogger.error("Phoenix socket error.", error);
  });

  setStoredConnection(storedConnection);
  return nextConnection;
}

export { PHOENIX_CHANNEL_TIMEOUT_MS };
