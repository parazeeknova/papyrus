defmodule PapyrusCollab.Collaboration.RoomTest do
  use ExUnit.Case, async: false

  alias PapyrusCollab.Auth.Identity
  alias PapyrusCollab.Collaboration.{BackupStore, Room, Snapshot}

  setup do
    :ok = BackupStore.reset()
    :ok
  end

  test "loads persisted snapshots and manages peer state transitions" do
    workbook_id = unique_workbook_id()
    identity_a = identity("user-a", "device-a", "user-a@example.com")
    identity_b = identity("user-b", "device-b", "user-b@example.com")

    seeded_snapshot =
      Snapshot.new(workbook_id, 2)
      |> Snapshot.replace_base_update("AQID", 2, identity_a)

    assert :ok = BackupStore.save_snapshot(seeded_snapshot)
    room = start_supervised!({Room, workbook_id})

    assert %{id: {PapyrusCollab.Collaboration.Room, ^workbook_id}} = Room.child_spec(workbook_id)
    assert {:ok, ^seeded_snapshot} = Room.snapshot(room)

    assert {:ok, peers} = Room.join_peer(room, identity_b, "viewer")
    assert Enum.map(peers, & &1.device_id) == ["device-b"]

    assert {:ok, peers} = Room.join_peer(room, identity_a, "editor")
    assert Enum.map(peers, & &1.device_id) == ["device-a", "device-b"]

    assert {:ok, peers} =
             Room.update_peer_presence(room, identity_a, %{
               "activeCell" => %{"col" => 1, "row" => 1},
               "selection" => nil,
               "sheetId" => "sheet-1"
             })

    assert [%{active_cell: %{"col" => 1, "row" => 1}, sheet_id: "sheet-1"} | _rest] = peers

    assert {:ok, peers} =
             Room.update_peer_typing(room, identity_a, %{
               "typing" => %{
                 "cell" => %{"col" => 1, "row" => 1},
                 "draft" => "editing",
                 "sheetId" => "sheet-1"
               }
             })

    assert [%{typing: %{"draft" => "editing"}} | _rest] = peers

    assert {:ok, peers} =
             Room.update_peer_presence(
               room,
               identity("user-missing", "device-missing", nil),
               %{"activeCell" => nil, "selection" => nil, "sheetId" => nil}
             )

    assert Enum.map(peers, & &1.device_id) == ["device-a", "device-b"]

    assert {:ok, peers} =
             Room.update_peer_typing(
               room,
               identity("user-missing", "device-missing", nil),
               %{"typing" => nil}
             )

    assert Enum.map(peers, & &1.device_id) == ["device-a", "device-b"]

    assert {:ok, peers} = Room.leave_peer(room, identity_b)
    assert Enum.map(peers, & &1.device_id) == ["device-a"]
  end

  test "bootstraps once, appends updates, and replaces the base update" do
    workbook_id = unique_workbook_id()
    room = start_supervised!({Room, workbook_id})
    identity = identity("user-owner", "device-owner", "owner@example.com")

    assert {:ok, snapshot} = Room.bootstrap_snapshot(room, "AQID", 0, identity)
    assert snapshot.base_update == "AQID"

    assert {:ok, unchanged_snapshot} = Room.bootstrap_snapshot(room, "ignored", 99, identity)
    assert unchanged_snapshot == snapshot

    assert {:ok, appended_snapshot} = Room.append_update(room, "BAUG", identity)
    assert appended_snapshot.pending_updates == [%{update: "BAUG", version: 1}]

    assert {:ok, replaced_snapshot} = Room.replace_base_update(room, "AQIDBAUG", 1, identity)
    assert replaced_snapshot.base_update == "AQIDBAUG"
    assert replaced_snapshot.pending_updates == []
    assert replaced_snapshot.version == 1
  end

  defp identity(user_id, device_id, email) do
    %Identity{device_id: device_id, email: email, user_id: user_id}
  end

  defp unique_workbook_id do
    "workbook-" <> Integer.to_string(System.unique_integer([:positive]))
  end
end
