import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { WorkbookMeta } from "@papyrus/core/workbook-types";

interface FakePushResponse {
  payload?: unknown;
  status: "error" | "ok" | "timeout";
}

type Handler = (payload?: unknown) => void;

interface FakeChannel {
  emit: (event: string, payload: unknown) => void;
  emitClose: () => void;
  emitError: (reason: unknown) => void;
  joinResponse: FakePushResponse;
  leaveCalled: boolean;
  pushCalls: Array<{ event: string; payload: unknown }>;
  pushResponses: Map<string, FakePushResponse>;
}

function createBase64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

function createFakePush(response: FakePushResponse) {
  return {
    receive(
      status: FakePushResponse["status"],
      callback: (payload?: unknown) => void
    ) {
      if (response.status === status) {
        callback(response.payload);
      }

      return this;
    },
  };
}

function createFakeChannel(): FakeChannel & {
  join: () => ReturnType<typeof createFakePush>;
  leave: () => ReturnType<typeof createFakePush>;
  off: () => void;
  on: (event: string, callback: Handler) => number;
  onClose: (callback: Handler) => void;
  onError: (callback: Handler) => void;
  push: (event: string, payload: unknown) => ReturnType<typeof createFakePush>;
} {
  const eventHandlers = new Map<string, Handler[]>();
  const closeHandlers: Handler[] = [];
  const errorHandlers: Handler[] = [];

  return {
    emit(event, payload) {
      for (const handler of eventHandlers.get(event) ?? []) {
        handler(payload);
      }
    },
    emitClose() {
      for (const handler of closeHandlers) {
        handler();
      }
    },
    emitError(reason) {
      for (const handler of errorHandlers) {
        handler(reason);
      }
    },
    join() {
      return createFakePush(this.joinResponse);
    },
    joinResponse: { status: "ok" },
    leave() {
      this.leaveCalled = true;
      return createFakePush({ status: "ok" });
    },
    leaveCalled: false,
    off() {
      return undefined;
    },
    on(event, callback) {
      const handlers = eventHandlers.get(event) ?? [];
      handlers.push(callback);
      eventHandlers.set(event, handlers);
      return handlers.length;
    },
    onClose(callback) {
      closeHandlers.push(callback);
    },
    onError(callback) {
      errorHandlers.push(callback);
    },
    push(event, payload) {
      this.pushCalls.push({ event, payload });
      return createFakePush(
        this.pushResponses.get(event) ?? { payload: undefined, status: "ok" }
      );
    },
    pushCalls: [],
    pushResponses: new Map<string, FakePushResponse>(),
  };
}

const ensurePhoenixSocketConnection = mock(() =>
  Promise.resolve({
    deviceId: "device-local",
    socket: {
      channel: () => fakeChannel,
    },
    token: "firebase-token",
    uid: "user-1",
  })
);

mock.module("@/web/platform/phoenix/socket-client", () => {
  return {
    PHOENIX_CHANNEL_TIMEOUT_MS: 10_000,
    ensurePhoenixSocketConnection,
  };
});

let fakeChannel = createFakeChannel();

const { connectWorkbookRealtimeChannel } = await import(
  "./workbook-realtime-channel-client"
);

describe("connectWorkbookRealtimeChannel", () => {
  beforeEach(() => {
    fakeChannel = createFakeChannel();
    ensurePhoenixSocketConnection.mockClear();
    ensurePhoenixSocketConnection.mockImplementation(() =>
      Promise.resolve({
        deviceId: "device-local",
        socket: {
          channel: () => fakeChannel,
        },
        token: "firebase-token",
        uid: "user-1",
      })
    );
  });

  test("joins the workbook channel, filters the local peer, and decodes realtime updates", async () => {
    fakeChannel.joinResponse = {
      payload: {
        accessRole: "editor",
        peers: [
          {
            accessRole: "editor",
            activeCell: null,
            deviceId: "device-local",
            email: "local@example.com",
            selection: null,
            sheetId: null,
            typing: null,
            updatedAt: 10,
            userId: "user-1",
          },
          {
            accessRole: "viewer",
            activeCell: { col: 2, row: 4 },
            deviceId: "device-remote",
            email: "remote.user@example.com",
            selection: null,
            sheetId: "sheet-1",
            typing: null,
            updatedAt: 11,
            userId: "user-2",
          },
        ],
        pendingUpdates: [createBase64([4, 5])],
        shouldInitializeFromClient: false,
        update: createBase64([1, 2, 3]),
        version: 4,
        workbookId: "workbook-1",
      },
      status: "ok",
    };
    fakeChannel.pushResponses.set("presence:push", {
      payload: {
        peers: [
          {
            accessRole: "viewer",
            activeCell: { col: 3, row: 5 },
            deviceId: "device-remote",
            email: "remote.user@example.com",
            selection: null,
            sheetId: "sheet-1",
            typing: null,
            updatedAt: 12,
            userId: "user-2",
          },
        ],
      },
      status: "ok",
    });
    fakeChannel.pushResponses.set("sync:push", {
      payload: { version: 5 },
      status: "ok",
    });
    fakeChannel.pushResponses.set("snapshot:push", {
      payload: {
        lastSyncedAt: "2026-03-13T00:00:00.000Z",
        version: 7,
      },
      status: "ok",
    });

    const statuses: string[] = [];
    const syncPayloads: Array<{ update: Uint8Array; version: number }> = [];
    const client = await connectWorkbookRealtimeChannel(
      "user-1",
      "workbook-1",
      null,
      {
        onStatusChange: (status) => {
          statuses.push(status);
        },
        onSync: (payload) => {
          syncPayloads.push(payload);
        },
      }
    );

    expect(ensurePhoenixSocketConnection).toHaveBeenCalledWith("user-1");
    expect(statuses).toEqual(["connecting", "connected"]);
    expect(client.accessRole).toBe("editor");
    expect(client.deviceId).toBe("device-local");
    expect(client.initialState.workbookId).toBe("workbook-1");
    expect(Array.from(client.initialState.update ?? [])).toEqual([1, 2, 3]);
    expect(
      client.initialState.pendingUpdates.map((update) => Array.from(update))
    ).toEqual([[4, 5]]);
    expect(client.initialState.peers).toEqual([
      {
        accessRole: "viewer",
        activeCell: { col: 2, row: 4 },
        identity: {
          clientId: "device-remote",
          color: expect.any(String),
          icon: expect.any(String),
          isAnonymous: false,
          name: "Remote User",
          photoURL: null,
        },
        selection: null,
        sheetId: "sheet-1",
        typing: null,
        updatedAt: 11,
      },
    ]);

    await expect(
      client.sendPresence({
        activeCell: { col: 3, row: 5 },
        selection: null,
        sheetId: "sheet-1",
      })
    ).resolves.toHaveLength(1);

    await expect(client.sendSync(new Uint8Array([8, 9]))).resolves.toBe(5);

    const snapshotPayload = {
      activeSheetId: "sheet-1",
      collaborationVersion: 5,
      meta: {
        createdAt: "2026-03-13T00:00:00.000Z",
        id: "workbook-1",
        isFavorite: false,
        lastOpenedAt: "2026-03-13T00:00:00.000Z",
        lastSyncedAt: null,
        name: "Budget",
        remoteVersion: 4,
        sharingAccessRole: "viewer",
        sharingEnabled: false,
        updatedAt: "2026-03-13T00:00:00.000Z",
      } satisfies WorkbookMeta,
      update: new Uint8Array([9, 9, 9]),
      version: 4,
    };

    await expect(
      client.sendSnapshot(snapshotPayload, "client-1")
    ).resolves.toEqual({
      lastSyncedAt: "2026-03-13T00:00:00.000Z",
      version: 7,
    });

    fakeChannel.emit("sync", {
      update: createBase64([6, 7]),
      version: 6,
    });
    expect(
      syncPayloads.map((payload) => ({
        ...payload,
        update: Array.from(payload.update),
      }))
    ).toEqual([
      {
        update: [6, 7],
        version: 6,
      },
    ]);

    expect(fakeChannel.pushCalls).toEqual([
      {
        event: "presence:push",
        payload: {
          activeCell: { col: 3, row: 5 },
          selection: null,
          sheetId: "sheet-1",
        },
      },
      {
        event: "sync:push",
        payload: {
          update: createBase64([8, 9]),
        },
      },
      {
        event: "snapshot:push",
        payload: {
          clientId: "client-1",
          workbook: {
            activeSheetId: "sheet-1",
            collaborationVersion: 5,
            meta: snapshotPayload.meta,
            updateBase64: createBase64([9, 9, 9]),
            version: 4,
          },
        },
      },
    ]);

    client.disconnect();
    expect(fakeChannel.leaveCalled).toBe(true);
  });

  test("surfaces channel errors through the status and error callbacks", async () => {
    fakeChannel.joinResponse = {
      payload: {
        accessRole: "viewer",
        peers: [],
        pendingUpdates: [],
        shouldInitializeFromClient: false,
        update: null,
        version: 0,
        workbookId: "workbook-2",
      },
      status: "ok",
    };

    const errors: string[] = [];
    const statuses: string[] = [];
    await connectWorkbookRealtimeChannel("user-1", "workbook-2", null, {
      onError: (error) => {
        errors.push(error.message);
      },
      onStatusChange: (status) => {
        statuses.push(status);
      },
    });

    fakeChannel.emitError({ reason: "forbidden" });
    fakeChannel.emitClose();

    expect(statuses).toEqual([
      "connecting",
      "connected",
      "disconnected",
      "disconnected",
    ]);
    expect(errors).toEqual([
      'Realtime request "channel_error" failed: forbidden.',
    ]);
  });
});
