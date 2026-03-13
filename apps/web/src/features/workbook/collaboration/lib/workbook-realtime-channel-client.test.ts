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

interface MockPhoenixSocketConnection {
  deviceId: string;
  isGuest: boolean;
  socket: {
    channel: (
      _topic: string,
      _params?: unknown
    ) => ReturnType<typeof createFakeChannel>;
  };
  token: string | null;
  uid: string | null;
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

function createMockSocketConnection(
  options?: Partial<MockPhoenixSocketConnection>
): MockPhoenixSocketConnection {
  return {
    deviceId: "device-local",
    isGuest: false,
    socket: {
      channel: (_topic: string, _params?: unknown) => fakeChannel,
    },
    token: "firebase-token",
    uid: "user-1",
    ...options,
  };
}

const ensurePhoenixSocketConnection = mock(() =>
  Promise.resolve(createMockSocketConnection())
);

const channelJoinCalls: Array<{ params: unknown; topic: string }> = [];

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
      Promise.resolve(
        createMockSocketConnection({
          socket: {
            channel: (topic: string, params?: unknown) => {
              channelJoinCalls.push({ params, topic });
              return fakeChannel;
            },
          },
        })
      )
    );
    channelJoinCalls.length = 0;
    window.history.replaceState({}, "", "/");
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
    expect(channelJoinCalls).toEqual([
      {
        params: { requestedAccessRole: null },
        topic: "workbook:workbook-1",
      },
    ]);
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

  test("uses the requested access role passed by the route session", async () => {
    window.history.replaceState({}, "", "/workbook/workbook-7");
    fakeChannel.joinResponse = {
      payload: {
        accessRole: "editor",
        peers: [],
        pendingUpdates: [],
        shouldInitializeFromClient: false,
        update: null,
        version: 0,
        workbookId: "workbook-7",
      },
      status: "ok",
    };

    await connectWorkbookRealtimeChannel("user-1", "workbook-7", "viewer");

    expect(channelJoinCalls).toEqual([
      {
        params: { requestedAccessRole: "viewer" },
        topic: "workbook:workbook-7",
      },
    ]);
  });

  test("rejects invalid join payloads and leaves the channel", async () => {
    fakeChannel.joinResponse = {
      payload: {
        accessRole: "editor",
        peers: "invalid-peers",
        pendingUpdates: [],
        shouldInitializeFromClient: false,
        update: null,
        version: 1,
        workbookId: "workbook-3",
      },
      status: "ok",
    };

    await expect(
      connectWorkbookRealtimeChannel("user-1", "workbook-3")
    ).rejects.toThrow("Realtime join returned an invalid payload.");
    expect(fakeChannel.leaveCalled).toBe(true);
  });

  test("rejects malformed pending updates during join", async () => {
    fakeChannel.joinResponse = {
      payload: {
        accessRole: "editor",
        peers: [],
        pendingUpdates: ["AQI=", 123],
        shouldInitializeFromClient: false,
        update: null,
        version: 1,
        workbookId: "workbook-3b",
      },
      status: "ok",
    };

    await expect(
      connectWorkbookRealtimeChannel("user-1", "workbook-3b")
    ).rejects.toThrow("Realtime join returned an invalid payload.");
    expect(fakeChannel.leaveCalled).toBe(true);
  });

  test("rejects join payloads with a non-array pending update field", async () => {
    fakeChannel.joinResponse = {
      payload: {
        accessRole: "editor",
        peers: [],
        pendingUpdates: "AQI=",
        shouldInitializeFromClient: false,
        update: null,
        version: 1,
        workbookId: "workbook-3c",
      },
      status: "ok",
    };

    await expect(
      connectWorkbookRealtimeChannel("user-1", "workbook-3c")
    ).rejects.toThrow("Realtime join returned an invalid payload.");
    expect(fakeChannel.leaveCalled).toBe(true);
  });

  test("surfaces join errors and timeouts", async () => {
    fakeChannel.joinResponse = {
      payload: { reason: "permission_denied" },
      status: "error",
    };

    await expect(
      connectWorkbookRealtimeChannel("user-1", "workbook-4")
    ).rejects.toThrow('Realtime request "join" failed: permission_denied.');

    fakeChannel.joinResponse = {
      status: "timeout",
    };

    await expect(
      connectWorkbookRealtimeChannel("user-1", "workbook-5")
    ).rejects.toThrow("Timed out connecting to the workbook channel.");

    fakeChannel.joinResponse = {
      payload: {},
      status: "error",
    };

    await expect(
      connectWorkbookRealtimeChannel("user-1", "workbook-5b")
    ).rejects.toThrow('Realtime request "join" failed.');
  });

  test("ignores invalid incoming presence, sync, and snapshot payloads", async () => {
    fakeChannel.joinResponse = {
      payload: {
        accessRole: "editor",
        peers: [],
        pendingUpdates: [],
        shouldInitializeFromClient: false,
        update: null,
        version: 0,
        workbookId: "workbook-6",
      },
      status: "ok",
    };

    const onPresence = mock((_peers: unknown[]) => undefined);
    const onSync = mock((_payload: unknown) => undefined);
    const onSnapshot = mock((_payload: unknown) => undefined);
    const client = await connectWorkbookRealtimeChannel(
      "user-1",
      "workbook-6",
      null,
      {
        onPresence,
        onSnapshot,
        onSync,
      }
    );

    fakeChannel.emit("presence", {
      peers: [
        {
          accessRole: "viewer",
          activeCell: { col: "bad", row: 2 },
          deviceId: "device-remote",
          email: "viewer@example.com",
          selection: null,
          sheetId: "sheet-1",
          typing: null,
          updatedAt: 1,
          userId: "user-2",
        },
      ],
    });
    fakeChannel.emit("presence", {
      peers: [
        {
          accessRole: "editor",
          activeCell: { col: "bad", row: 1 },
          deviceId: "device-weird",
          email: "viewer@example.com",
          selection: {
            end: { col: "bad", row: 2 },
            mode: "diagonal",
            start: { col: 1, row: 1 },
          },
          sheetId: { bad: true },
          typing: {
            cell: { col: "bad", row: 1 },
            draft: 123,
            sheetId: 456,
          },
          updatedAt: 1,
          userId: "user-3",
        },
        {
          accessRole: "editor",
          activeCell: null,
          deviceId: "device-weird-start",
          email: "viewer@example.com",
          selection: {
            end: { col: 2, row: 2 },
            mode: "cells",
            start: { col: "bad", row: 1 },
          },
          sheetId: null,
          typing: null,
          updatedAt: 1,
          userId: "user-3b",
        },
        {
          accessRole: "editor",
          activeCell: null,
          deviceId: "device-weird-typing",
          email: "viewer@example.com",
          selection: null,
          sheetId: "sheet-1",
          typing: {
            cell: { col: "bad", row: 1 },
            draft: "editing",
            sheetId: "sheet-1",
          },
          updatedAt: 1,
          userId: "user-3c",
        },
        {
          accessRole: "viewer",
          activeCell: null,
          deviceId: "device-weird-2",
          email: 123,
          selection: null,
          sheetId: null,
          typing: null,
          updatedAt: 1,
          userId: "user-4",
        },
        {
          accessRole: "viewer",
          activeCell: null,
          deviceId: "device-weird-3",
          email: "viewer@example.com",
          selection: null,
          sheetId: 42,
          typing: null,
          updatedAt: 1,
          userId: "user-5",
        },
        {
          accessRole: "viewer",
          activeCell: null,
          email: "viewer@example.com",
          selection: null,
          sheetId: null,
          typing: null,
          updatedAt: 1,
          userId: "user-6",
        },
      ],
    });
    fakeChannel.emit("presence", null);
    fakeChannel.emit("sync", { update: 123, version: "bad" });
    fakeChannel.emit("snapshot", {
      update: createBase64([7, 8]),
      version: 2,
    });
    fakeChannel.emit("snapshot", { update: null, version: 1 });

    expect(onPresence).toHaveBeenCalledTimes(3);
    expect(onSync).not.toHaveBeenCalled();
    expect(onSnapshot).toHaveBeenCalledWith({
      update: new Uint8Array([7, 8]),
      version: 2,
    });

    client.disconnect();
    fakeChannel.emitError({ reason: "ignored-after-disconnect" });
    fakeChannel.emitClose();
  });

  test("rejects invalid realtime acknowledgements and supports typing updates", async () => {
    fakeChannel.joinResponse = {
      payload: {
        accessRole: "editor",
        peers: [],
        pendingUpdates: [],
        shouldInitializeFromClient: false,
        update: null,
        version: 0,
        workbookId: "workbook-7",
      },
      status: "ok",
    };
    fakeChannel.pushResponses.set("presence:push", {
      payload: { peers: "invalid" },
      status: "ok",
    });
    fakeChannel.pushResponses.set("sync:push", {
      payload: { version: "invalid" },
      status: "ok",
    });
    fakeChannel.pushResponses.set("snapshot:push", {
      payload: { lastSyncedAt: 123, version: "invalid" },
      status: "ok",
    });
    fakeChannel.pushResponses.set("typing:push", {
      payload: {
        peers: [
          {
            accessRole: "viewer",
            activeCell: null,
            deviceId: "device-remote",
            email: null,
            selection: {
              end: { col: 2, row: 2 },
              mode: "cells",
              start: { col: 1, row: 1 },
            },
            sheetId: "sheet-1",
            typing: {
              cell: { col: 1, row: 1 },
              draft: "editing",
              sheetId: "sheet-1",
            },
            updatedAt: 2,
            userId: "user-2",
          },
        ],
      },
      status: "ok",
    });

    const onPresence = mock((_peers: unknown[]) => undefined);
    const client = await connectWorkbookRealtimeChannel(
      "user-1",
      "workbook-7",
      null,
      {
        onPresence,
      }
    );

    await expect(
      client.sendPresence({
        activeCell: null,
        selection: null,
        sheetId: null,
      })
    ).rejects.toThrow(
      'Realtime request "presence:push" returned invalid data.'
    );

    await expect(client.sendSync(new Uint8Array([1]))).rejects.toThrow(
      'Realtime request "sync:push" returned invalid data.'
    );

    fakeChannel.pushResponses.set("sync:push", {
      payload: {},
      status: "error",
    });

    await expect(client.sendSync(new Uint8Array([2]))).rejects.toThrow(
      'Realtime request "sync:push" failed.'
    );

    fakeChannel.pushResponses.set("sync:push", {
      status: "timeout",
    });

    await expect(client.sendSync(new Uint8Array([3]))).rejects.toThrow(
      'Realtime request "sync:push" timed out.'
    );

    await expect(
      client.sendSnapshot(
        {
          activeSheetId: null,
          collaborationVersion: 1,
          meta: {
            createdAt: "2026-03-13T00:00:00.000Z",
            id: "workbook-7",
            isFavorite: false,
            lastOpenedAt: "2026-03-13T00:00:00.000Z",
            lastSyncedAt: null,
            name: "Workbook",
            remoteVersion: 1,
            sharingAccessRole: "viewer",
            sharingEnabled: false,
            updatedAt: "2026-03-13T00:00:00.000Z",
          },
          update: new Uint8Array([1, 2, 3]),
          version: 1,
        },
        "client-7"
      )
    ).rejects.toThrow(
      'Realtime request "snapshot:push" returned invalid data.'
    );

    await expect(
      client.sendTyping({
        typing: {
          cell: { col: 1, row: 1 },
          draft: "editing",
          sheetId: "sheet-1",
        },
      })
    ).resolves.toEqual([
      {
        accessRole: "viewer",
        activeCell: null,
        identity: {
          clientId: "device-remote",
          color: "#2563eb",
          icon: "diamond",
          isAnonymous: true,
          name: "Guest User 2",
          photoURL: null,
        },
        selection: {
          end: { col: 2, row: 2 },
          mode: "cells",
          start: { col: 1, row: 1 },
        },
        sheetId: "sheet-1",
        typing: {
          cell: { col: 1, row: 1 },
          draft: "editing",
          sheetId: "sheet-1",
        },
        updatedAt: 2,
      },
    ]);

    expect(onPresence).toHaveBeenCalledTimes(2);
    client.disconnect();
  });

  test("uses a guest socket connection for anonymous shared workbook joins", async () => {
    fakeChannel.joinResponse = {
      payload: {
        accessRole: "editor",
        peers: [],
        pendingUpdates: [],
        shouldInitializeFromClient: false,
        update: null,
        version: 2,
        workbookId: "workbook-guest",
      },
      status: "ok",
    };
    ensurePhoenixSocketConnection.mockImplementation(() =>
      Promise.resolve(
        createMockSocketConnection({
          deviceId: "device-guest",
          isGuest: true,
          socket: {
            channel: (topic: string, params?: unknown) => {
              channelJoinCalls.push({ params, topic });
              return fakeChannel;
            },
          },
          token: null,
          uid: null,
        })
      )
    );

    const client = await connectWorkbookRealtimeChannel(
      null,
      "workbook-guest",
      "editor"
    );

    expect(ensurePhoenixSocketConnection).toHaveBeenCalledWith(null);
    expect(channelJoinCalls).toEqual([
      {
        params: { requestedAccessRole: "editor" },
        topic: "workbook:workbook-guest",
      },
    ]);
    expect(client.accessRole).toBe("editor");

    client.disconnect();
  });

  test("surfaces generic channel errors without callbacks safely", async () => {
    fakeChannel.joinResponse = {
      payload: {
        accessRole: "viewer",
        peers: [],
        pendingUpdates: [],
        shouldInitializeFromClient: true,
        update: null,
        version: 0,
        workbookId: "workbook-8",
      },
      status: "ok",
    };

    const statuses: string[] = [];
    const errors: string[] = [];

    const client = await connectWorkbookRealtimeChannel(
      "user-1",
      "workbook-8",
      null,
      {
        onError: (error) => {
          errors.push(error.message);
        },
        onStatusChange: (status) => {
          statuses.push(status);
        },
      }
    );

    fakeChannel.emitError({});

    expect(statuses).toEqual(["connecting", "connected", "disconnected"]);
    expect(errors).toEqual(['Realtime request "channel_error" failed.']);

    client.disconnect();
  });
});
