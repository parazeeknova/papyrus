defmodule PapyrusCollab.Collaboration.Room do
  @moduledoc false

  use GenServer, restart: :transient

  alias PapyrusCollab.Auth.Identity
  alias PapyrusCollab.Collaboration.{BackupStore, Snapshot}

  @type state :: %{snapshot: Snapshot.t()}

  @spec start_link(String.t()) :: GenServer.on_start()
  def start_link(workbook_id) when is_binary(workbook_id) do
    GenServer.start_link(__MODULE__, workbook_id, name: via_tuple(workbook_id))
  end

  @spec apply_snapshot(GenServer.server(), Snapshot.payload(), Identity.t()) ::
          {:ok, Snapshot.t()}
  def apply_snapshot(server, payload, %Identity{} = identity) do
    GenServer.call(server, {:apply_snapshot, payload, identity})
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

  @impl true
  def init(workbook_id) do
    snapshot = BackupStore.load_snapshot(workbook_id) || Snapshot.new(workbook_id)
    {:ok, %{snapshot: snapshot}}
  end

  @impl true
  def handle_call(:snapshot, _from, state) do
    {:reply, {:ok, state.snapshot}, state}
  end

  @impl true
  def handle_call({:apply_snapshot, payload, %Identity{} = identity}, _from, state) do
    snapshot = Snapshot.apply_update(state.snapshot, payload, identity)
    :ok = BackupStore.save_snapshot(snapshot)
    {:reply, {:ok, snapshot}, %{state | snapshot: snapshot}}
  end

  defp via_tuple(workbook_id) do
    {:via, Registry, {PapyrusCollab.Collaboration.RoomRegistry, workbook_id}}
  end
end
