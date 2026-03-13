defmodule PapyrusCollab.Collaboration.BackupStore.InMemoryTest do
  use ExUnit.Case, async: false

  alias PapyrusCollab.Collaboration.BackupStore.InMemory
  alias PapyrusCollab.Collaboration.Snapshot

  setup do
    case Process.whereis(InMemory) do
      nil ->
        start_supervised!(InMemory)

      _pid ->
        :ok
    end

    :ok = InMemory.reset()
    :ok
  end

  test "stores and clears snapshots in memory" do
    assert %{id: PapyrusCollab.Collaboration.BackupStore.InMemory} = InMemory.child_spec([])

    snapshot = Snapshot.new("workbook-1", 2)

    assert nil == InMemory.load_snapshot("workbook-1")
    assert :ok = InMemory.save_snapshot(snapshot)
    assert %Snapshot{workbook_id: "workbook-1", version: 2} = InMemory.load_snapshot("workbook-1")
    assert :ok = InMemory.reset()
    assert nil == InMemory.load_snapshot("workbook-1")
  end
end
