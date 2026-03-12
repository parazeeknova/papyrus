defmodule PapyrusCollab.Collaboration do
  @moduledoc false

  alias PapyrusCollab.Auth.Identity
  alias PapyrusCollab.Collaboration.{BackupStore, Room, RoomSupervisor, Snapshot}

  @spec apply_snapshot(String.t(), Snapshot.payload(), Identity.t()) ::
          {:ok, Snapshot.t()} | {:error, term()}
  def apply_snapshot(workbook_id, payload, %Identity{} = identity)
      when is_binary(workbook_id) and byte_size(workbook_id) > 0 do
    with {:ok, room} <- ensure_room_started(workbook_id) do
      Room.apply_snapshot(room, payload, identity)
    end
  end

  @spec fetch_snapshot(String.t()) :: {:ok, Snapshot.t()} | {:error, term()}
  def fetch_snapshot(workbook_id)
      when is_binary(workbook_id) and byte_size(workbook_id) > 0 do
    with {:ok, room} <- ensure_room_started(workbook_id) do
      Room.snapshot(room)
    end
  end

  @spec reset_backup_store() :: :ok
  def reset_backup_store do
    BackupStore.reset()
  end

  defp ensure_room_started(workbook_id) do
    case Registry.lookup(PapyrusCollab.Collaboration.RoomRegistry, workbook_id) do
      [{pid, _value}] ->
        if Process.alive?(pid) do
          {:ok, pid}
        else
          start_room(workbook_id)
        end

      [] ->
        start_room(workbook_id)
    end
  end

  defp start_room(workbook_id) do
    case DynamicSupervisor.start_child(RoomSupervisor, {Room, workbook_id}) do
      {:ok, pid} -> {:ok, pid}
      {:error, {:already_started, pid}} -> {:ok, pid}
      {:error, reason} -> {:error, reason}
    end
  end
end
