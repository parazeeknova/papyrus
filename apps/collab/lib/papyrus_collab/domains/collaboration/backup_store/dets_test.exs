defmodule PapyrusCollab.Collaboration.BackupStore.DetsTest do
  use ExUnit.Case, async: false

  alias PapyrusCollab.Auth.Identity
  alias PapyrusCollab.Collaboration.BackupStore.Dets
  alias PapyrusCollab.Collaboration.Snapshot

  @test_server :papyrus_collab_dets_test_server
  @test_table :papyrus_collab_backup_store_test

  test "persists snapshots across adapter restarts" do
    path = unique_backup_path()
    snapshot = persisted_snapshot("workbook-dets-1")

    on_exit(fn ->
      stop_adapter()
      File.rm(path)
      path |> Path.dirname() |> File.rmdir()
    end)

    start_adapter(path)
    assert :ok = Dets.save_snapshot(@test_server, snapshot)
    assert %Snapshot{} = Dets.load_snapshot(@test_server, snapshot.workbook_id)

    stop_adapter()
    start_adapter(path)

    assert %Snapshot{} =
             restored_snapshot = Dets.load_snapshot(@test_server, snapshot.workbook_id)

    assert restored_snapshot.base_update == snapshot.base_update
    assert restored_snapshot.pending_updates == snapshot.pending_updates
    assert restored_snapshot.updated_by == snapshot.updated_by
    assert restored_snapshot.version == snapshot.version
  end

  test "reset removes persisted snapshots from the dets table" do
    path = unique_backup_path()
    snapshot = persisted_snapshot("workbook-dets-2")

    on_exit(fn ->
      stop_adapter()
      File.rm(path)
      path |> Path.dirname() |> File.rmdir()
    end)

    start_adapter(path)
    assert :ok = Dets.save_snapshot(@test_server, snapshot)
    assert %Snapshot{} = Dets.load_snapshot(@test_server, snapshot.workbook_id)

    assert :ok = Dets.reset(@test_server)
    assert Dets.load_snapshot(@test_server, snapshot.workbook_id) == nil
  end

  test "falls back to the default tmp-backed path when none is configured" do
    previous_config = Application.get_env(:papyrus_collab, Dets, [])
    default_server = :papyrus_collab_dets_default_test_server
    default_table = :papyrus_collab_backup_store_default_test
    snapshot = persisted_snapshot("workbook-dets-default")

    Application.delete_env(:papyrus_collab, Dets)

    on_exit(fn ->
      case Process.whereis(default_server) do
        nil -> :ok
        pid -> GenServer.stop(pid, :normal)
      end

      Application.put_env(:papyrus_collab, Dets, previous_config)
    end)

    {:ok, _pid} = Dets.start_link(name: default_server, table: default_table)
    assert :ok = Dets.save_snapshot(default_server, snapshot)
    assert %Snapshot{} = Dets.load_snapshot(default_server, snapshot.workbook_id)
  end

  defp persisted_snapshot(workbook_id) do
    identity = %Identity{
      device_id: "device-primary",
      email: "owner@example.com",
      user_id: "user-owner"
    }

    Snapshot.new(workbook_id)
    |> Snapshot.replace_base_update("AQID", 0, identity)
    |> Snapshot.append_update("BAUG", identity)
  end

  defp start_adapter(path) do
    {:ok, _pid} =
      Dets.start_link(
        name: @test_server,
        path: path,
        table: @test_table
      )
  end

  defp stop_adapter do
    case Process.whereis(@test_server) do
      nil ->
        :ok

      pid ->
        try do
          GenServer.stop(pid, :normal)
        catch
          :exit, _reason -> :ok
        end
    end
  end

  defp unique_backup_path do
    Path.join(
      Path.join(System.tmp_dir!(), "papyrus-collab-tests"),
      "backup-#{System.unique_integer([:positive])}.dets"
    )
  end
end
