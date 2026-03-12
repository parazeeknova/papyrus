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

    assert {:ok, snapshot} =
             Collaboration.apply_snapshot(workbook_id, %{"doc" => "snapshot-v1"}, identity)

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
    assert restored_snapshot.payload == snapshot.payload
    assert restored_snapshot.updated_by == snapshot.updated_by
    assert restored_snapshot.version == snapshot.version
  end
end
