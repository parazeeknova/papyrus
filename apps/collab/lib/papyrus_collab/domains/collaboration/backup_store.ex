defmodule PapyrusCollab.Collaboration.BackupStore do
  @moduledoc false

  alias PapyrusCollab.Collaboration.Snapshot

  @callback child_spec(keyword()) :: Supervisor.child_spec()
  @callback load_snapshot(String.t()) :: Snapshot.t() | nil
  @callback save_snapshot(Snapshot.t()) :: :ok
  @callback reset() :: :ok

  # Keep the storage boundary isolated so Firestore-backed snapshot
  # persistence can replace the in-memory adapter without changing rooms.
  @spec child_spec(keyword()) :: Supervisor.child_spec()
  def child_spec(opts) do
    adapter().child_spec(opts)
  end

  @spec load_snapshot(String.t()) :: Snapshot.t() | nil
  def load_snapshot(workbook_id) when is_binary(workbook_id) do
    adapter().load_snapshot(workbook_id)
  end

  @spec save_snapshot(Snapshot.t()) :: :ok
  def save_snapshot(%Snapshot{} = snapshot) do
    adapter().save_snapshot(snapshot)
  end

  @spec reset() :: :ok
  def reset do
    adapter().reset()
  end

  defp adapter do
    Application.fetch_env!(:papyrus_collab, __MODULE__)[:adapter]
  end
end
