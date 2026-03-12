defmodule PapyrusCollab.Collaboration.Room do
  @moduledoc false

  use GenServer, restart: :transient

  alias PapyrusCollab.Auth.Identity
  alias PapyrusCollab.Collaboration.{BackupStore, Snapshot}

  @type peer :: %{
          access_role: String.t(),
          active_cell: map() | nil,
          device_id: String.t(),
          email: String.t() | nil,
          selection: map() | nil,
          sheet_id: String.t() | nil,
          typing: map() | nil,
          updated_at_ms: non_neg_integer(),
          user_id: String.t()
        }

  @type state :: %{
          peers: %{String.t() => peer()},
          snapshot: Snapshot.t()
        }

  @spec start_link(String.t()) :: GenServer.on_start()
  def start_link(workbook_id) when is_binary(workbook_id) do
    GenServer.start_link(__MODULE__, workbook_id, name: via_tuple(workbook_id))
  end

  @spec append_update(GenServer.server(), String.t(), Identity.t()) :: {:ok, Snapshot.t()}
  def append_update(server, update, %Identity{} = identity)
      when is_binary(update) and byte_size(update) > 0 do
    GenServer.call(server, {:append_update, update, identity})
  end

  @spec bootstrap_snapshot(GenServer.server(), String.t(), non_neg_integer(), Identity.t()) ::
          {:ok, Snapshot.t()}
  def bootstrap_snapshot(server, base_update, version, %Identity{} = identity)
      when is_binary(base_update) and byte_size(base_update) > 0 and is_integer(version) and
             version >= 0 do
    GenServer.call(server, {:bootstrap_snapshot, base_update, version, identity})
  end

  @spec join_peer(GenServer.server(), Identity.t(), String.t()) :: {:ok, [peer()]}
  def join_peer(server, %Identity{} = identity, access_role)
      when access_role in ["editor", "viewer"] do
    GenServer.call(server, {:join_peer, identity, access_role})
  end

  @spec leave_peer(GenServer.server(), Identity.t()) :: {:ok, [peer()]}
  def leave_peer(server, %Identity{} = identity) do
    GenServer.call(server, {:leave_peer, identity})
  end

  @spec replace_base_update(GenServer.server(), String.t(), non_neg_integer(), Identity.t()) ::
          {:ok, Snapshot.t()}
  def replace_base_update(server, base_update, flushed_version, %Identity{} = identity)
      when is_binary(base_update) and byte_size(base_update) > 0 and is_integer(flushed_version) and
             flushed_version >= 0 do
    GenServer.call(server, {:replace_base_update, base_update, flushed_version, identity})
  end

  @spec child_spec(String.t()) :: Supervisor.child_spec()
  def child_spec(workbook_id) do
    %{
      id: {__MODULE__, workbook_id},
      restart: :transient,
      start: {__MODULE__, :start_link, [workbook_id]}
    }
  end

  @spec snapshot(GenServer.server()) :: {:ok, Snapshot.t()}
  def snapshot(server) do
    GenServer.call(server, :snapshot)
  end

  @spec update_peer_presence(GenServer.server(), Identity.t(), map()) :: {:ok, [peer()]}
  def update_peer_presence(server, %Identity{} = identity, payload) when is_map(payload) do
    GenServer.call(server, {:update_peer_presence, identity, payload})
  end

  @spec update_peer_typing(GenServer.server(), Identity.t(), map()) :: {:ok, [peer()]}
  def update_peer_typing(server, %Identity{} = identity, payload) when is_map(payload) do
    GenServer.call(server, {:update_peer_typing, identity, payload})
  end

  @impl true
  def init(workbook_id) do
    snapshot = BackupStore.load_snapshot(workbook_id) || Snapshot.new(workbook_id)
    {:ok, %{peers: %{}, snapshot: snapshot}}
  end

  @impl true
  def handle_call(:snapshot, _from, state) do
    {:reply, {:ok, state.snapshot}, state}
  end

  @impl true
  def handle_call({:append_update, update, %Identity{} = identity}, _from, state) do
    snapshot = Snapshot.append_update(state.snapshot, update, identity)
    :ok = BackupStore.save_snapshot(snapshot)
    {:reply, {:ok, snapshot}, %{state | snapshot: snapshot}}
  end

  @impl true
  def handle_call(
        {:bootstrap_snapshot, base_update, version, %Identity{} = identity},
        _from,
        state
      ) do
    if Snapshot.empty?(state.snapshot) do
      snapshot =
        Snapshot.new(state.snapshot.workbook_id, version)
        |> Snapshot.replace_base_update(base_update, version, identity)

      :ok = BackupStore.save_snapshot(snapshot)
      {:reply, {:ok, snapshot}, %{state | snapshot: snapshot}}
    else
      {:reply, {:ok, state.snapshot}, state}
    end
  end

  @impl true
  def handle_call({:join_peer, %Identity{} = identity, access_role}, _from, state) do
    peers =
      Map.put(state.peers, identity.device_id, build_peer(identity, access_role))
      |> Map.values()
      |> sort_peers()

    {:reply, {:ok, peers}, %{state | peers: Map.new(peers, &{&1.device_id, &1})}}
  end

  @impl true
  def handle_call({:leave_peer, %Identity{} = identity}, _from, state) do
    peers =
      state.peers
      |> Map.delete(identity.device_id)
      |> Map.values()
      |> sort_peers()

    {:reply, {:ok, peers}, %{state | peers: Map.new(peers, &{&1.device_id, &1})}}
  end

  @impl true
  def handle_call(
        {:replace_base_update, base_update, flushed_version, %Identity{} = identity},
        _from,
        state
      ) do
    snapshot =
      Snapshot.replace_base_update(state.snapshot, base_update, flushed_version, identity)

    :ok = BackupStore.save_snapshot(snapshot)
    {:reply, {:ok, snapshot}, %{state | snapshot: snapshot}}
  end

  @impl true
  def handle_call({:update_peer_presence, %Identity{} = identity, payload}, _from, state) do
    peers =
      update_peer(state.peers, identity.device_id, fn peer ->
        %{
          peer
          | active_cell: Map.get(payload, "activeCell"),
            selection: Map.get(payload, "selection"),
            sheet_id: Map.get(payload, "sheetId"),
            updated_at_ms: now_ms()
        }
      end)

    {:reply, {:ok, peers}, %{state | peers: Map.new(peers, &{&1.device_id, &1})}}
  end

  @impl true
  def handle_call({:update_peer_typing, %Identity{} = identity, payload}, _from, state) do
    peers =
      update_peer(state.peers, identity.device_id, fn peer ->
        %{
          peer
          | typing: Map.get(payload, "typing"),
            updated_at_ms: now_ms()
        }
      end)

    {:reply, {:ok, peers}, %{state | peers: Map.new(peers, &{&1.device_id, &1})}}
  end

  defp build_peer(%Identity{} = identity, access_role) do
    %{
      access_role: access_role,
      active_cell: nil,
      device_id: identity.device_id,
      email: identity.email,
      selection: nil,
      sheet_id: nil,
      typing: nil,
      updated_at_ms: now_ms(),
      user_id: identity.user_id
    }
  end

  defp now_ms do
    System.system_time(:millisecond)
  end

  defp sort_peers(peers) do
    Enum.sort_by(peers, &{&1.user_id, &1.device_id})
  end

  defp update_peer(peers, device_id, updater) do
    case Map.fetch(peers, device_id) do
      {:ok, peer} ->
        peers
        |> Map.put(device_id, updater.(peer))
        |> Map.values()
        |> sort_peers()

      :error ->
        peers
        |> Map.values()
        |> sort_peers()
    end
  end

  defp via_tuple(workbook_id) do
    {:via, Registry, {PapyrusCollab.Collaboration.RoomRegistry, workbook_id}}
  end
end
