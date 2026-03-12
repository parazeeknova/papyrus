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
end
