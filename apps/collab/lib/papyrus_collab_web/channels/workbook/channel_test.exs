defmodule PapyrusCollabWeb.WorkbookChannelTest do
  use PapyrusCollabWeb.ChannelCase, async: false

  alias PapyrusCollab.Auth.Identity
  alias PapyrusCollab.CloudWorkbooks
  alias PapyrusCollab.CloudWorkbooks.Store
  alias PapyrusCollab.Collaboration
  alias PapyrusCollab.Collaboration.AccessPolicy
  alias PapyrusCollab.Collaboration.AccessPolicy.TestAdapter
  alias PapyrusCollabWeb.{UserSocket, WorkbookChannel}

  defmodule CloudWorkbookStoreStub do
    @behaviour Store

    @impl true
    def delete_workbook(_user_id, _workbook_id), do: :ok

    @impl true
    def list_workbooks(_user_id), do: {:ok, []}

    @impl true
    def read_workbook(user_id, workbook_id) do
      Application.get_env(:papyrus_collab, __MODULE__, [])
      |> Keyword.get(:responses, %{})
      |> Map.get({user_id, workbook_id}, {:ok, nil})
    end

    @impl true
    def write_workbook(user_id, workbook, client_id) do
      Application.get_env(:papyrus_collab, __MODULE__, [])
      |> Keyword.get(:writes, %{})
      |> Map.get({user_id, get_in(workbook, ["meta", "id"]), client_id}, {:ok, %{version: 1}})
    end

    def reset, do: :ok
  end

  setup do
    previous_access_policy = Application.get_env(:papyrus_collab, AccessPolicy)
    previous_store = Application.get_env(:papyrus_collab, Store)
    previous_test_adapter = Application.get_env(:papyrus_collab, TestAdapter)
    previous_store_stub = Application.get_env(:papyrus_collab, CloudWorkbookStoreStub)

    Application.put_env(:papyrus_collab, AccessPolicy, adapter: TestAdapter)
    Application.put_env(:papyrus_collab, TestAdapter, responses: %{})

    on_exit(fn ->
      restore_env(:papyrus_collab, AccessPolicy, previous_access_policy)
      restore_env(:papyrus_collab, Store, previous_store)
      restore_env(:papyrus_collab, TestAdapter, previous_test_adapter)
      restore_env(:papyrus_collab, CloudWorkbookStoreStub, previous_store_stub)
    end)

    :ok
  end

  test "joining bootstraps the room snapshot and returns the current peer list" do
    workbook_id = unique_workbook_id()
    allow_realtime_access("user-1", workbook_id, "editor", workbook_payload(workbook_id))

    assert {:ok, socket} =
             connect(UserSocket, socket_params("user-1", "device-a", "user-1@example.com"))

    assert {:ok, response, _joined_socket} =
             subscribe_and_join(socket, WorkbookChannel, "workbook:" <> workbook_id)

    assert response.accessRole == "editor"
    assert response.pendingUpdates == []
    assert response.shouldInitializeFromClient == false
    assert response.update == "AQID"
    assert response.version == 0
    assert response.workbookId == workbook_id

    assert [
             %{
               accessRole: "editor",
               activeCell: nil,
               deviceId: "device-a",
               email: "user-1@example.com",
               selection: nil,
               sheetId: nil,
               typing: nil,
               updatedAt: updated_at,
               userId: "user-1"
             }
           ] = response.peers

    assert is_integer(updated_at)

    assert {:ok, snapshot} = Collaboration.fetch_snapshot(workbook_id)
    assert snapshot.base_update == "AQID"
    assert snapshot.pending_updates == []
    assert snapshot.version == 0
  end

  test "sync pushes broadcast incremental updates and snapshot pushes persist the durable state" do
    workbook_id = unique_workbook_id()
    owner_identity = identity("user-a", "device-a", "user-a@example.com")

    allow_realtime_access("user-a", workbook_id, "editor", workbook_payload(workbook_id))
    allow_realtime_access("user-b", workbook_id, "editor", workbook_payload(workbook_id))

    assert {:ok, %{version: 1}} =
             CloudWorkbooks.write_workbook(
               owner_identity,
               workbook_payload(workbook_id),
               "seed-client"
             )

    assert {:ok, socket_a} =
             connect(UserSocket, socket_params("user-a", "device-a", "user-a@example.com"))

    assert {:ok, _response_a, socket_a} =
             subscribe_and_join(socket_a, WorkbookChannel, "workbook:" <> workbook_id)

    assert {:ok, socket_b} =
             connect(UserSocket, socket_params("user-b", "device-b", "user-b@example.com"))

    assert {:ok, response_b, _socket_b} =
             subscribe_and_join(socket_b, WorkbookChannel, "workbook:" <> workbook_id)

    assert length(response_b.peers) == 2

    sync_ref = push(socket_a, "sync:push", %{"update" => "BAUG"})
    assert_reply sync_ref, :ok, %{version: 1}

    assert_broadcast "sync", %{update: "BAUG", version: 1}

    assert {:ok, pending_snapshot} = Collaboration.fetch_snapshot(workbook_id)
    assert pending_snapshot.base_update == "AQID"
    assert pending_snapshot.pending_updates == [%{update: "BAUG", version: 1}]
    assert pending_snapshot.version == 1

    assert {:ok, socket_c} =
             connect(UserSocket, socket_params("user-c", "device-c", "user-c@example.com"))

    allow_realtime_access("user-c", workbook_id, "editor", workbook_payload(workbook_id))

    assert {:ok, response_c, _socket_c} =
             subscribe_and_join(socket_c, WorkbookChannel, "workbook:" <> workbook_id)

    assert response_c.update == "AQID"
    assert response_c.pendingUpdates == ["BAUG"]
    assert response_c.version == 1

    snapshot_ref =
      push(socket_a, "snapshot:push", %{
        "clientId" => "client-a",
        "workbook" =>
          workbook_payload(
            workbook_id,
            "AQIDBAUG",
            1
          )
          |> Map.put("collaborationVersion", 1)
      })

    assert_reply snapshot_ref, :ok, %{lastSyncedAt: last_synced_at, version: 2}
    assert is_binary(last_synced_at)

    assert_broadcast "snapshot", %{update: "AQIDBAUG", version: 1}

    assert {:ok, flushed_snapshot} = Collaboration.fetch_snapshot(workbook_id)
    assert flushed_snapshot.base_update == "AQIDBAUG"
    assert flushed_snapshot.pending_updates == []
    assert flushed_snapshot.version == 1

    assert {:ok, persisted_workbook} =
             CloudWorkbooks.read_workbook(owner_identity, workbook_id)

    assert persisted_workbook["updateBase64"] == "AQIDBAUG"
    assert persisted_workbook["version"] == 2
    assert persisted_workbook["meta"]["remoteVersion"] == 2
  end

  test "shared editors persist workbook snapshots into the owner namespace without mutating share settings" do
    workbook_id = unique_workbook_id()
    owner_identity = identity("owner-1", "device-owner", "owner@example.com")

    assert {:ok, %{version: 1}} =
             CloudWorkbooks.write_workbook(
               owner_identity,
               shared_workbook_payload(workbook_id, "editor"),
               "seed-client"
             )

    allow_realtime_access(
      "editor-1",
      workbook_id,
      "editor",
      shared_workbook_payload(workbook_id, "editor"),
      owner_identity.user_id
    )

    assert {:ok, socket} =
             connect(
               UserSocket,
               socket_params("editor-1", "device-editor", "editor@example.com")
             )

    assert {:ok, response, socket} =
             subscribe_and_join(socket, WorkbookChannel, "workbook:" <> workbook_id)

    assert response.accessRole == "editor"

    snapshot_ref =
      push(socket, "snapshot:push", %{
        "clientId" => "client-editor",
        "workbook" =>
          shared_workbook_payload(
            workbook_id,
            "viewer",
            "AQIDBAUG",
            1
          )
          |> put_in(["meta", "isFavorite"], true)
          |> put_in(["meta", "lastOpenedAt"], "2026-03-14T00:00:00.000Z")
          |> put_in(["meta", "name"], "Edited Budget")
          |> put_in(["meta", "sharingEnabled"], false)
          |> Map.put("collaborationVersion", 1)
      })

    assert_reply snapshot_ref, :ok, %{version: 2}

    assert {:ok, owner_workbook} =
             CloudWorkbooks.read_workbook(owner_identity, workbook_id)

    assert owner_workbook["updateBase64"] == "AQIDBAUG"
    assert owner_workbook["meta"]["name"] == "Budget"
    assert owner_workbook["meta"]["isFavorite"] == false
    assert owner_workbook["meta"]["lastOpenedAt"] == "2026-03-13T00:00:00.000Z"
    assert owner_workbook["meta"]["sharingAccessRole"] == "editor"
    assert owner_workbook["meta"]["sharingEnabled"] == true

    shared_identity = identity("editor-1", "device-editor", "editor@example.com")

    assert {:ok, nil} =
             CloudWorkbooks.read_workbook(shared_identity, workbook_id)
  end

  test "viewers can publish presence but cannot push typing, sync, or snapshots" do
    workbook_id = unique_workbook_id()
    allow_realtime_access("viewer-1", workbook_id, "viewer", workbook_payload(workbook_id))

    assert {:ok, socket} =
             connect(UserSocket, socket_params("viewer-1", "device-v", "viewer@example.com"))

    assert {:ok, response, socket} =
             subscribe_and_join(socket, WorkbookChannel, "workbook:" <> workbook_id)

    assert response.accessRole == "viewer"

    presence_ref =
      push(socket, "presence:push", %{
        "activeCell" => %{"col" => 2, "row" => 4},
        "selection" => %{
          "end" => %{"col" => 3, "row" => 6},
          "mode" => "cells",
          "start" => %{"col" => 2, "row" => 4}
        },
        "sheetId" => "sheet-1"
      })

    assert_reply presence_ref, :ok, %{peers: peers}
    assert [%{accessRole: "viewer", activeCell: %{"col" => 2, "row" => 4}}] = peers

    assert_broadcast "presence", %{peers: [%{accessRole: "viewer"}]}

    sync_ref = push(socket, "sync:push", %{"update" => "BAUG"})
    assert_reply sync_ref, :error, %{reason: "forbidden"}

    typing_ref =
      push(socket, "typing:push", %{
        "typing" => %{
          "cell" => %{"col" => 2, "row" => 4},
          "draft" => "locked",
          "sheetId" => "sheet-1"
        }
      })

    assert_reply typing_ref, :error, %{reason: "forbidden"}

    snapshot_ref =
      push(socket, "snapshot:push", %{
        "clientId" => "client-viewer",
        "workbook" =>
          workbook_payload(
            workbook_id,
            "AQIDBAUG",
            1
          )
          |> Map.put("collaborationVersion", 1)
      })

    assert_reply snapshot_ref, :error, %{reason: "forbidden"}
  end

  test "shared editor links can be downscoped to viewer access at join time" do
    workbook_id = unique_workbook_id()

    allow_realtime_access(
      "viewer-1",
      workbook_id,
      "editor",
      shared_workbook_payload(workbook_id, "editor"),
      "owner-1"
    )

    assert {:ok, socket} =
             connect(UserSocket, socket_params("viewer-1", "device-v", "viewer@example.com"))

    assert {:ok, response, socket} =
             subscribe_and_join(
               socket,
               WorkbookChannel,
               "workbook:" <> workbook_id,
               %{"requestedAccessRole" => "viewer"}
             )

    assert response.accessRole == "viewer"

    sync_ref = push(socket, "sync:push", %{"update" => "BAUG"})
    assert_reply sync_ref, :error, %{reason: "forbidden"}
  end

  test "shared editor links accept snake case requested access params at join time" do
    workbook_id = unique_workbook_id()

    allow_realtime_access(
      "viewer-2",
      workbook_id,
      "editor",
      shared_workbook_payload(workbook_id, "editor"),
      "owner-2"
    )

    assert {:ok, socket} =
             connect(UserSocket, socket_params("viewer-2", "device-v2", "viewer2@example.com"))

    assert {:ok, response, socket} =
             subscribe_and_join(
               socket,
               WorkbookChannel,
               "workbook:" <> workbook_id,
               %{"requested_access_role" => "viewer"}
             )

    assert response.accessRole == "viewer"

    sync_ref = push(socket, "sync:push", %{"update" => "BAUG"})
    assert_reply sync_ref, :error, %{reason: "forbidden"}
  end

  test "joining rejects unauthorized users" do
    workbook_id = unique_workbook_id()

    assert {:ok, socket} =
             connect(UserSocket, socket_params("user-a", "device-a", "user-a@example.com"))

    assert {:error, %{reason: "forbidden"}} =
             subscribe_and_join(socket, WorkbookChannel, "workbook:" <> workbook_id)
  end

  test "direct channel error paths fail closed with normalized reasons" do
    workbook_id = unique_workbook_id()
    identity = identity("user-error", "device-error", "user-error@example.com")

    socket =
      %Phoenix.Socket{
        assigns: %{
          access_role: "editor",
          identity: identity,
          owner_id: "owner-missing",
          workbook_id: workbook_id
        }
      }

    responses =
      Application.get_env(:papyrus_collab, TestAdapter, [])
      |> Keyword.get(:responses, %{})
      |> Map.put({identity.user_id, workbook_id}, {:error, :storage_unavailable})

    Application.put_env(:papyrus_collab, TestAdapter, responses: responses)

    assert {:error, %{reason: "storage_unavailable"}} =
             WorkbookChannel.join("workbook:" <> workbook_id, %{}, %Phoenix.Socket{
               assigns: %{identity: identity}
             })

    assert {:error, %{reason: "invalid_workbook_id"}} =
             WorkbookChannel.join("workbook:", %{}, %Phoenix.Socket{
               assigns: %{identity: identity}
             })

    assert {:reply, {:error, %{reason: "invalid_presence_payload"}}, ^socket} =
             WorkbookChannel.handle_in("presence:push", nil, socket)

    assert {:reply, {:error, %{reason: "invalid_string"}}, ^socket} =
             WorkbookChannel.handle_in(
               "presence:push",
               %{"activeCell" => nil, "selection" => nil, "sheetId" => 1},
               socket
             )

    assert {:reply, {:error, %{reason: "payload_required"}}, ^socket} =
             WorkbookChannel.handle_in("sync:push", %{"update" => ""}, socket)

    assert {:reply, {:error, %{reason: "payload_required"}}, ^socket} =
             WorkbookChannel.handle_in("sync:push", %{}, socket)

    assert {:reply, {:error, %{reason: "payload_required"}}, ^socket} =
             WorkbookChannel.handle_in("snapshot:push", %{}, socket)

    assert {:reply, {:error, %{reason: "invalid_workbook_payload"}}, ^socket} =
             WorkbookChannel.handle_in(
               "snapshot:push",
               %{
                 "clientId" => "client-error",
                 "workbook" => %{
                   "collaborationVersion" => -1,
                   "meta" => %{"id" => "wrong-id"},
                   "updateBase64" => ""
                 }
               },
               socket
             )

    assert {:reply, {:error, %{reason: "invalid_typing_payload"}}, ^socket} =
             WorkbookChannel.handle_in("typing:push", nil, socket)

    assert {:reply, {:error, %{reason: "invalid_typing_payload"}}, ^socket} =
             WorkbookChannel.handle_in(
               "typing:push",
               %{"typing" => %{"cell" => nil, "draft" => "editing", "sheetId" => nil}},
               socket
             )

    assert {:reply, {:error, %{reason: "forbidden"}}, ^socket} =
             WorkbookChannel.handle_in(
               "snapshot:push",
               %{
                 "clientId" => "client-error",
                 "workbook" =>
                   workbook_payload(
                     workbook_id,
                     "AQID",
                     0
                   )
                   |> Map.put("collaborationVersion", 0)
               },
               socket
             )
  end

  test "viewer fallback, requested role parsing, and terminate fail closed" do
    workbook_id = unique_workbook_id()

    allow_realtime_access(
      "viewer-raw",
      workbook_id,
      "viewer",
      workbook_payload(workbook_id)
    )

    identity = identity("viewer-raw", "device-viewer", "viewer-raw@example.com")

    assert {:ok, response, _socket} =
             WorkbookChannel.join(
               "workbook:" <> workbook_id,
               %{"requestedAccessRole" => "owner"},
               %Phoenix.Socket{assigns: %{identity: identity}}
             )

    assert response.accessRole == "viewer"

    assert :ok =
             WorkbookChannel.terminate(:normal, %Phoenix.Socket{
               assigns: %{identity: identity, workbook_id: nil}
             })
  end

  test "accepts non-map join params, broadcasts typing updates, and emits presence on terminate" do
    workbook_id = unique_workbook_id()
    allow_realtime_access("user-typing", workbook_id, "editor", workbook_payload(workbook_id))

    assert {:ok, socket} =
             connect(
               UserSocket,
               socket_params("user-typing", "device-typing", "typing@example.com")
             )

    assert {:ok, response, _raw_socket} =
             WorkbookChannel.join(
               "workbook:" <> workbook_id,
               nil,
               %Phoenix.Socket{
                 assigns: %{
                   identity: identity("user-typing", "device-typing", "typing@example.com")
                 }
               }
             )

    assert {:ok, _joined_payload, joined_socket} =
             subscribe_and_join(socket, WorkbookChannel, "workbook:" <> workbook_id)

    assert response.accessRole == "editor"

    typing_ref = push(joined_socket, "typing:push", %{"typing" => nil})
    assert_reply typing_ref, :ok, %{peers: [%{typing: nil}]}
    assert_broadcast "presence", %{peers: [%{typing: nil}]}

    assert :ok = WorkbookChannel.terminate(:normal, joined_socket)
    assert_broadcast "presence", %{peers: []}
  end

  test "normalizes binary and inspectable join reasons" do
    workbook_id = unique_workbook_id()

    Application.put_env(
      :papyrus_collab,
      TestAdapter,
      responses: %{
        {"binary-user", workbook_id} => {:error, "custom_binary"},
        {"tuple-user", workbook_id} => {:error, {:custom, :tuple}}
      }
    )

    assert {:ok, binary_socket} =
             connect(UserSocket, socket_params("binary-user", "device-binary", nil))

    assert {:error, %{reason: "custom_binary"}} =
             subscribe_and_join(binary_socket, WorkbookChannel, "workbook:" <> workbook_id)

    assert {:ok, tuple_socket} =
             connect(UserSocket, socket_params("tuple-user", "device-tuple", nil))

    assert {:error, %{reason: "{:custom, :tuple}"}} =
             subscribe_and_join(tuple_socket, WorkbookChannel, "workbook:" <> workbook_id)
  end

  test "rejects invalid presence, snapshot, and typing payload shapes for editors" do
    workbook_id = unique_workbook_id()
    identity = identity("editor-invalid", "device-invalid", "editor-invalid@example.com")

    socket =
      %Phoenix.Socket{
        assigns: %{
          access_role: "editor",
          identity: identity,
          owner_id: identity.user_id,
          workbook_id: workbook_id
        }
      }

    assert {:reply, {:error, %{reason: "invalid_cell"}}, ^socket} =
             WorkbookChannel.handle_in(
               "presence:push",
               %{"activeCell" => "bad", "selection" => nil, "sheetId" => nil},
               socket
             )

    assert {:reply, {:error, %{reason: "invalid_selection"}}, ^socket} =
             WorkbookChannel.handle_in(
               "presence:push",
               %{"activeCell" => nil, "selection" => "bad", "sheetId" => nil},
               socket
             )

    assert {:reply, {:error, %{reason: "invalid_workbook_payload"}}, ^socket} =
             WorkbookChannel.handle_in(
               "snapshot:push",
               %{"clientId" => "client-invalid", "workbook" => []},
               socket
             )

    assert {:reply, {:error, %{reason: "invalid_workbook_payload"}}, ^socket} =
             WorkbookChannel.handle_in(
               "snapshot:push",
               %{
                 "clientId" => "client-invalid",
                 "workbook" =>
                   workbook_payload(workbook_id)
                   |> Map.put("collaborationVersion", "bad")
               },
               socket
             )

    assert {:reply, {:error, %{reason: "invalid_typing_payload"}}, ^socket} =
             WorkbookChannel.handle_in("typing:push", %{"typing" => "bad"}, socket)
  end

  test "fails shared editor snapshot persistence when the owner workbook cannot be sanitized" do
    workbook_id = unique_workbook_id()

    Application.put_env(:papyrus_collab, Store, adapter: CloudWorkbookStoreStub)

    Application.put_env(
      :papyrus_collab,
      CloudWorkbookStoreStub,
      responses: %{{"owner-broken", workbook_id} => {:ok, %{"broken" => true}}}
    )

    allow_realtime_access(
      "shared-editor",
      workbook_id,
      "editor",
      shared_workbook_payload(workbook_id, "editor"),
      "owner-broken"
    )

    assert {:ok, socket} =
             connect(UserSocket, socket_params("shared-editor", "device-shared", nil))

    assert {:ok, _response, joined_socket} =
             subscribe_and_join(socket, WorkbookChannel, "workbook:" <> workbook_id)

    snapshot_ref =
      push(joined_socket, "snapshot:push", %{
        "clientId" => "client-shared",
        "workbook" =>
          shared_workbook_payload(workbook_id, "editor")
          |> Map.put("collaborationVersion", 0)
      })

    assert_reply snapshot_ref, :error, %{reason: "invalid_workbook_payload"}
  end

  test "terminates cleanly when the collaboration supervisor is temporarily unavailable" do
    supervisor_pid = Process.whereis(PapyrusCollab.Collaboration.RoomSupervisor)
    supervisor_ref = Process.monitor(supervisor_pid)

    Process.exit(supervisor_pid, :kill)
    assert_receive {:DOWN, ^supervisor_ref, :process, ^supervisor_pid, _reason}

    assert :ok =
             WorkbookChannel.terminate(:normal, %Phoenix.Socket{
               assigns: %{
                 identity: identity("user-crash", "device-crash", nil),
                 workbook_id: unique_workbook_id()
               }
             })

    assert Process.alive?(wait_for_room_supervisor_restart(supervisor_pid, 20))
  end

  defp allow_realtime_access(
         user_id,
         workbook_id,
         access_role,
         workbook,
         owner_id \\ nil
       ) do
    resolved_owner_id = owner_id || user_id

    responses =
      Application.get_env(:papyrus_collab, TestAdapter, [])
      |> Keyword.get(:responses, %{})
      |> Map.put(
        {user_id, workbook_id},
        %{access_role: access_role, owner_id: resolved_owner_id, workbook: workbook}
      )

    Application.put_env(:papyrus_collab, TestAdapter, responses: responses)
  end

  defp identity(user_id, device_id, email) do
    %Identity{
      device_id: device_id,
      email: email,
      user_id: user_id
    }
  end

  defp restore_env(app, key, nil), do: Application.delete_env(app, key)
  defp restore_env(app, key, value), do: Application.put_env(app, key, value)

  defp wait_for_room_supervisor_restart(previous_pid, attempts_left)
       when is_integer(attempts_left) and attempts_left > 0 do
    case Process.whereis(PapyrusCollab.Collaboration.RoomSupervisor) do
      nil ->
        Process.sleep(10)
        wait_for_room_supervisor_restart(previous_pid, attempts_left - 1)

      ^previous_pid ->
        Process.sleep(10)
        wait_for_room_supervisor_restart(previous_pid, attempts_left - 1)

      new_pid ->
        new_pid
    end
  end

  defp wait_for_room_supervisor_restart(_previous_pid, 0),
    do: Process.whereis(PapyrusCollab.Collaboration.RoomSupervisor)

  defp workbook_payload(workbook_id, update_base64 \\ "AQID", version \\ 0) do
    %{
      "activeSheetId" => "sheet-1",
      "meta" => %{
        "createdAt" => "2026-03-13T00:00:00.000Z",
        "id" => workbook_id,
        "isFavorite" => false,
        "lastOpenedAt" => "2026-03-13T00:00:00.000Z",
        "lastSyncedAt" => nil,
        "name" => "Budget",
        "remoteVersion" => nil,
        "sharingAccessRole" => "viewer",
        "sharingEnabled" => false,
        "updatedAt" => "2026-03-13T00:00:00.000Z"
      },
      "updateBase64" => update_base64,
      "version" => version
    }
  end

  defp shared_workbook_payload(
         workbook_id,
         sharing_access_role,
         update_base64 \\ "AQID",
         version \\ 0
       ) do
    workbook_payload(workbook_id, update_base64, version)
    |> put_in(["meta", "sharingAccessRole"], sharing_access_role)
    |> put_in(["meta", "sharingEnabled"], true)
  end
end
