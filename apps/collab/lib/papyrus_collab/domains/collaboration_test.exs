defmodule PapyrusCollab.CollaborationTest do
  use ExUnit.Case, async: false

  alias PapyrusCollab.Auth.Identity
  alias PapyrusCollab.Collaboration

  setup do
    Collaboration.reset_backup_store()
    :ok
  end

  test "restores the last snapshot after a room shuts down" do
    workbook_id = "workbook-" <> Integer.to_string(System.unique_integer([:positive]))

    identity = %Identity{
      device_id: "device-primary",
      email: "owner@example.com",
      user_id: "user-owner"
    }

    assert {:ok, _snapshot} = Collaboration.bootstrap_snapshot(workbook_id, "AQID", 0, identity)
    assert {:ok, snapshot} = Collaboration.append_update(workbook_id, "BAUG", identity)

    [{room_pid, _value}] =
      Registry.lookup(PapyrusCollab.Collaboration.RoomRegistry, workbook_id)

    room_down_ref = Process.monitor(room_pid)

    assert :ok =
             DynamicSupervisor.terminate_child(
               PapyrusCollab.Collaboration.RoomSupervisor,
               room_pid
             )

    assert_receive {:DOWN, ^room_down_ref, :process, ^room_pid, _reason}

    assert {:ok, restored_snapshot} = Collaboration.fetch_snapshot(workbook_id)
    assert restored_snapshot.base_update == "AQID"
    assert restored_snapshot.pending_updates == [%{update: "BAUG", version: 1}]
    assert restored_snapshot.updated_by == snapshot.updated_by
    assert restored_snapshot.version == snapshot.version
  end

  test "replacing the base update keeps newer pending updates in the room" do
    workbook_id = "workbook-" <> Integer.to_string(System.unique_integer([:positive]))

    identity = %Identity{
      device_id: "device-primary",
      email: "owner@example.com",
      user_id: "user-owner"
    }

    assert {:ok, _snapshot} = Collaboration.bootstrap_snapshot(workbook_id, "AQID", 0, identity)
    assert {:ok, _snapshot} = Collaboration.append_update(workbook_id, "BAUG", identity)
    assert {:ok, _snapshot} = Collaboration.append_update(workbook_id, "BwgJ", identity)

    assert {:ok, snapshot} =
             Collaboration.replace_base_update(workbook_id, "AQIDBAUG", 1, identity)

    assert snapshot.base_update == "AQIDBAUG"
    assert snapshot.pending_updates == [%{update: "BwgJ", version: 2}]
    assert snapshot.version == 2
  end

  test "joins peers and updates realtime presence and typing through the collaboration boundary" do
    workbook_id = "workbook-" <> Integer.to_string(System.unique_integer([:positive]))

    identity = %Identity{
      device_id: "device-primary",
      email: "owner@example.com",
      user_id: "user-owner"
    }

    assert {:ok, [%{access_role: "editor"}]} =
             Collaboration.join_peer(workbook_id, identity, "editor")

    assert {:ok, [%{active_cell: %{"col" => 1, "row" => 2}, sheet_id: "sheet-1"}]} =
             Collaboration.update_peer_presence(workbook_id, identity, %{
               "activeCell" => %{"col" => 1, "row" => 2},
               "selection" => nil,
               "sheetId" => "sheet-1"
             })

    assert {:ok, [%{typing: %{"draft" => "editing"}}]} =
             Collaboration.update_peer_typing(workbook_id, identity, %{
               "typing" => %{
                 "cell" => %{"col" => 1, "row" => 2},
                 "draft" => "editing",
                 "sheetId" => "sheet-1"
               }
             })

    assert {:ok, []} = Collaboration.leave_peer(workbook_id, identity)
  end

  test "restarts rooms when the registry points at a dead pid" do
    workbook_id = "workbook-" <> Integer.to_string(System.unique_integer([:positive]))
    dead_pid = spawn(fn -> :ok end)
    ref = Process.monitor(dead_pid)

    assert_receive {:DOWN, ^ref, :process, ^dead_pid, _reason}

    true =
      :ets.insert(
        PapyrusCollab.Collaboration.RoomRegistry,
        {workbook_id, dead_pid, nil}
      )

    assert {:ok, snapshot} = Collaboration.fetch_snapshot(workbook_id)
    assert snapshot.workbook_id == workbook_id
  end

  test "reuses an already started room during concurrent startup races" do
    workbook_id = "workbook-" <> Integer.to_string(System.unique_integer([:positive]))

    results =
      1..8
      |> Task.async_stream(
        fn _index -> Collaboration.fetch_snapshot(workbook_id) end,
        ordered: false,
        timeout: 5_000
      )
      |> Enum.to_list()

    assert Enum.all?(results, fn
             {:ok, {:ok, snapshot}} -> snapshot.workbook_id == workbook_id
             _result -> false
           end)
  end
end
