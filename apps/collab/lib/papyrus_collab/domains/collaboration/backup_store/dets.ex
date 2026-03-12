defmodule PapyrusCollab.Collaboration.BackupStore.Dets do
  @moduledoc false

  use GenServer

  @behaviour PapyrusCollab.Collaboration.BackupStore

  alias PapyrusCollab.Collaboration.Snapshot

  @type state :: %{
          table: atom()
        }

  @impl true
  @spec child_spec(keyword()) :: Supervisor.child_spec()
  def child_spec(opts) do
    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [opts]}
    }
  end

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @impl true
  @spec load_snapshot(String.t()) :: Snapshot.t() | nil
  def load_snapshot(workbook_id) when is_binary(workbook_id) do
    load_snapshot(__MODULE__, workbook_id)
  end

  @spec load_snapshot(GenServer.server(), String.t()) :: Snapshot.t() | nil
  def load_snapshot(server, workbook_id)
      when is_binary(workbook_id) do
    GenServer.call(server, {:load_snapshot, workbook_id})
  end

  @impl true
  @spec save_snapshot(Snapshot.t()) :: :ok
  def save_snapshot(%Snapshot{} = snapshot) do
    save_snapshot(__MODULE__, snapshot)
  end

  @spec save_snapshot(GenServer.server(), Snapshot.t()) :: :ok
  def save_snapshot(server, %Snapshot{} = snapshot) do
    GenServer.call(server, {:save_snapshot, snapshot})
  end

  @impl true
  @spec reset() :: :ok
  def reset do
    reset(__MODULE__)
  end

  @spec reset(GenServer.server()) :: :ok
  def reset(server) do
    GenServer.call(server, :reset)
  end

  @impl true
  def init(opts) do
    table = Keyword.get(opts, :table, __MODULE__)
    path = Keyword.get_lazy(opts, :path, &configured_path/0)
    path |> Path.dirname() |> File.mkdir_p!()

    {:ok, table} =
      :dets.open_file(table, file: String.to_charlist(path), type: :set)

    {:ok, %{table: table}}
  end

  @impl true
  def terminate(_reason, %{table: table}) do
    :ok = :dets.close(table)
    :ok
  end

  @impl true
  def handle_call({:load_snapshot, workbook_id}, _from, %{table: table} = state) do
    snapshot =
      case :dets.lookup(table, workbook_id) do
        [{^workbook_id, %Snapshot{} = snapshot}] -> snapshot
        _records -> nil
      end

    {:reply, snapshot, state}
  end

  @impl true
  def handle_call({:save_snapshot, %Snapshot{} = snapshot}, _from, %{table: table} = state) do
    :ok = :dets.insert(table, {snapshot.workbook_id, snapshot})
    # Flush each snapshot write so room recovery does not depend on VM shutdown.
    :ok = :dets.sync(table)
    {:reply, :ok, state}
  end

  @impl true
  def handle_call(:reset, _from, %{table: table} = state) do
    :ok = :dets.delete_all_objects(table)
    :ok = :dets.sync(table)
    {:reply, :ok, state}
  end

  defp configured_path do
    Application.get_env(:papyrus_collab, __MODULE__, [])[:path] ||
      Path.join(System.tmp_dir!(), "papyrus-collab/backups.dets")
  end
end
