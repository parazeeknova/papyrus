defmodule PapyrusCollab.Collaboration do
  @moduledoc false

  alias PapyrusCollab.Auth.Identity
  alias PapyrusCollab.Collaboration.{AccessPolicy, BackupStore, Room, RoomSupervisor, Snapshot}

  @spec append_update(String.t(), String.t(), Identity.t()) ::
          {:ok, Snapshot.t()} | {:error, term()}
  def append_update(workbook_id, update, %Identity{} = identity)
      when is_binary(workbook_id) and byte_size(workbook_id) > 0 and is_binary(update) and
             byte_size(update) > 0 do
    with {:ok, room} <- ensure_room_started(workbook_id) do
      Room.append_update(room, update, identity)
    end
  end

  @spec authorize_realtime_workbook(Identity.t(), String.t()) ::
          {:ok, %{access_role: String.t(), owner_id: String.t(), workbook: map()}}
          | {:error, :forbidden | term()}
  def authorize_realtime_workbook(%Identity{} = identity, workbook_id)
      when is_binary(workbook_id) and byte_size(workbook_id) > 0 do
    AccessPolicy.authorize_workbook(identity, workbook_id)
  end

  @spec fetch_snapshot(String.t()) :: {:ok, Snapshot.t()} | {:error, term()}
  def fetch_snapshot(workbook_id)
      when is_binary(workbook_id) and byte_size(workbook_id) > 0 do
    with {:ok, room} <- ensure_room_started(workbook_id) do
      Room.snapshot(room)
    end
  end

  @spec bootstrap_snapshot(String.t(), String.t(), non_neg_integer(), Identity.t()) ::
          {:ok, Snapshot.t()} | {:error, term()}
  def bootstrap_snapshot(workbook_id, base_update, version, %Identity{} = identity)
      when is_binary(workbook_id) and byte_size(workbook_id) > 0 and is_binary(base_update) and
             byte_size(base_update) > 0 and is_integer(version) and version >= 0 do
    with {:ok, room} <- ensure_room_started(workbook_id) do
      Room.bootstrap_snapshot(room, base_update, version, identity)
    end
  end

  @spec join_peer(String.t(), Identity.t(), String.t()) :: {:ok, [Room.peer()]} | {:error, term()}
  def join_peer(workbook_id, %Identity{} = identity, access_role)
      when is_binary(workbook_id) and byte_size(workbook_id) > 0 and
             access_role in ["editor", "viewer"] do
    with {:ok, room} <- ensure_room_started(workbook_id) do
      Room.join_peer(room, identity, access_role)
    end
  end

  @spec leave_peer(String.t(), Identity.t()) :: {:ok, [Room.peer()]} | {:error, term()}
  def leave_peer(workbook_id, %Identity{} = identity)
      when is_binary(workbook_id) and byte_size(workbook_id) > 0 do
    with {:ok, room} <- ensure_room_started(workbook_id) do
      Room.leave_peer(room, identity)
    end
  end

  @spec reset_backup_store() :: :ok
  def reset_backup_store do
    BackupStore.reset()
  end

  @spec replace_base_update(String.t(), String.t(), non_neg_integer(), Identity.t()) ::
          {:ok, Snapshot.t()} | {:error, term()}
  def replace_base_update(workbook_id, base_update, flushed_version, %Identity{} = identity)
      when is_binary(workbook_id) and byte_size(workbook_id) > 0 and is_binary(base_update) and
             byte_size(base_update) > 0 and is_integer(flushed_version) and flushed_version >= 0 do
    with {:ok, room} <- ensure_room_started(workbook_id) do
      Room.replace_base_update(room, base_update, flushed_version, identity)
    end
  end

  @spec update_peer_presence(String.t(), Identity.t(), map()) ::
          {:ok, [Room.peer()]} | {:error, term()}
  def update_peer_presence(workbook_id, %Identity{} = identity, payload)
      when is_binary(workbook_id) and byte_size(workbook_id) > 0 and is_map(payload) do
    with {:ok, room} <- ensure_room_started(workbook_id) do
      Room.update_peer_presence(room, identity, payload)
    end
  end

  @spec update_peer_typing(String.t(), Identity.t(), map()) ::
          {:ok, [Room.peer()]} | {:error, term()}
  def update_peer_typing(workbook_id, %Identity{} = identity, payload)
      when is_binary(workbook_id) and byte_size(workbook_id) > 0 and is_map(payload) do
    with {:ok, room} <- ensure_room_started(workbook_id) do
      Room.update_peer_typing(room, identity, payload)
    end
  end

  defp ensure_room_started(workbook_id) do
    case Registry.lookup(PapyrusCollab.Collaboration.RoomRegistry, workbook_id) do
      [{pid, _value}] ->
        if Process.alive?(pid), do: {:ok, pid}, else: start_room(workbook_id)

      [] ->
        start_room(workbook_id)
    end
  end

  defp start_room(workbook_id) do
    case DynamicSupervisor.start_child(RoomSupervisor, {Room, workbook_id}) do
      {:ok, pid} -> {:ok, pid}
      {:error, {:already_started, pid}} -> {:ok, pid}
    end
  catch
    :exit, reason -> {:error, reason}
  end
end
