defmodule PapyrusCollabWeb.WorkbookChannelTest do
  use PapyrusCollabWeb.ChannelCase, async: false

  alias PapyrusCollab.Auth.Identity
  alias PapyrusCollab.CloudWorkbooks
  alias PapyrusCollab.Collaboration
  alias PapyrusCollab.Collaboration.AccessPolicy
  alias PapyrusCollab.Collaboration.AccessPolicy.TestAdapter
  alias PapyrusCollabWeb.{UserSocket, WorkbookChannel}

  setup do
    previous_access_policy = Application.get_env(:papyrus_collab, AccessPolicy)
    previous_test_adapter = Application.get_env(:papyrus_collab, TestAdapter)

    Application.put_env(:papyrus_collab, AccessPolicy, adapter: TestAdapter)
    Application.put_env(:papyrus_collab, TestAdapter, responses: %{})

    on_exit(fn ->
      restore_env(:papyrus_collab, AccessPolicy, previous_access_policy)
      restore_env(:papyrus_collab, TestAdapter, previous_test_adapter)
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
