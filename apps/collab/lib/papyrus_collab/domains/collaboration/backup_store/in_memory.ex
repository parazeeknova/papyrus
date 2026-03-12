defmodule PapyrusCollab.Collaboration.BackupStore.InMemory do
  @moduledoc false

  use Agent

  @behaviour PapyrusCollab.Collaboration.BackupStore

  alias PapyrusCollab.Collaboration.Snapshot

  @impl true
  @spec child_spec(keyword()) :: Supervisor.child_spec()
  def child_spec(opts) do
    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [opts]}
    }
  end

  @spec start_link(keyword()) :: Agent.on_start()
  def start_link(_opts) do
    Agent.start_link(fn -> %{} end, name: __MODULE__)
  end

  @impl true
  @spec load_snapshot(String.t()) :: Snapshot.t() | nil
  def load_snapshot(workbook_id) when is_binary(workbook_id) do
    Agent.get(__MODULE__, &Map.get(&1, workbook_id))
  end

  @impl true
  @spec save_snapshot(Snapshot.t()) :: :ok
  def save_snapshot(%Snapshot{} = snapshot) do
    Agent.update(__MODULE__, &Map.put(&1, snapshot.workbook_id, snapshot))
  end

  @impl true
  @spec reset() :: :ok
  def reset do
    Agent.update(__MODULE__, fn _current_state -> %{} end)
  end
end
