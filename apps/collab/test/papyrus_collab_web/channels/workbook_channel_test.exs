defmodule PapyrusCollabWeb.WorkbookChannelTest do
  use PapyrusCollabWeb.ChannelCase, async: false

  alias PapyrusCollab.Collaboration
  alias PapyrusCollabWeb.{UserSocket, WorkbookChannel}

  test "joining returns the current snapshot and device presence" do
    workbook_id = unique_workbook_id()

    assert {:ok, socket} =
             connect(UserSocket, socket_params("user-1", "device-a", "user-1@example.com"))

    assert {:ok, response, _joined_socket} =
             subscribe_and_join(socket, WorkbookChannel, "workbook:" <> workbook_id)

    assert response.payload == nil
    assert response.updatedBy == nil
    assert response.version == 0
    assert response.workbookId == workbook_id

    assert_push "presence_state", presences

    presence = Map.fetch!(presences, "device-a")
    metas = Map.get(presence, :metas) || Map.get(presence, "metas") || []
    meta = List.first(metas)

    assert (Map.get(meta, :userId) || Map.get(meta, "userId")) == "user-1"
  end

  test "snapshot pushes broadcast and persist the latest room state" do
    workbook_id = unique_workbook_id()

    assert {:ok, socket_a} =
             connect(UserSocket, socket_params("user-a", "device-a", "user-a@example.com"))

    assert {:ok, _reply_a, socket_a} =
             subscribe_and_join(socket_a, WorkbookChannel, "workbook:" <> workbook_id)

    assert_push "presence_state", _initial_presence

    assert {:ok, socket_b} =
             connect(UserSocket, socket_params("user-b", "device-b", "user-b@example.com"))

    assert {:ok, _reply_b, _socket_b} =
             subscribe_and_join(socket_b, WorkbookChannel, "workbook:" <> workbook_id)

    assert_push "presence_state", _second_presence

    update_ref = push(socket_a, "snapshot:push", %{"payload" => %{"doc" => "snapshot-v2"}})

    assert_reply update_ref, :ok, %{
      payload: %{"doc" => "snapshot-v2"},
      updatedBy: "user-a",
      version: 1,
      workbookId: ^workbook_id
    }

    assert_broadcast "snapshot:applied", %{
      payload: %{"doc" => "snapshot-v2"},
      updatedBy: "user-a",
      version: 1
    }

    assert {:ok, snapshot} = Collaboration.fetch_snapshot(workbook_id)
    assert snapshot.payload == %{"doc" => "snapshot-v2"}
    assert snapshot.updated_by == "user-a"
    assert snapshot.version == 1
  end

  test "snapshot pushes reject missing payloads" do
    workbook_id = unique_workbook_id()

    assert {:ok, socket} =
             connect(UserSocket, socket_params("user-a", "device-a", "user-a@example.com"))

    assert {:ok, _reply, socket} =
             subscribe_and_join(socket, WorkbookChannel, "workbook:" <> workbook_id)

    assert_push "presence_state", _presence

    update_ref = push(socket, "snapshot:push", %{})

    assert_reply update_ref, :error, %{reason: "payload_required"}
  end
end
