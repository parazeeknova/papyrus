defmodule PapyrusCollab.SharedWorkbooks.Store.InMemory do
  @moduledoc false

  use Agent

  @behaviour PapyrusCollab.SharedWorkbooks.Store

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
  @spec delete_workbook(String.t()) :: :ok
  def delete_workbook(workbook_id) when is_binary(workbook_id) do
    Agent.update(__MODULE__, &Map.delete(&1, workbook_id))
  end

  @impl true
  @spec read_workbook(String.t()) :: {:ok, map() | nil}
  def read_workbook(workbook_id) when is_binary(workbook_id) do
    shared_workbook =
      Agent.get(__MODULE__, fn records ->
        records
        |> Map.get(workbook_id)
        |> parse_shared_workbook()
      end)

    {:ok, shared_workbook}
  end

  @impl true
  @spec reset() :: :ok
  def reset do
    Agent.update(__MODULE__, fn _records -> %{} end)
  end

  @impl true
  @spec sync_workbook(String.t(), map()) :: :ok | {:error, term()}
  def sync_workbook(owner_id, workbook)
      when is_binary(owner_id) and is_map(workbook) do
    with {:ok, shared_workbook} <- normalize_workbook(owner_id, workbook) do
      if shared_workbook["sharingEnabled"] do
        Agent.update(__MODULE__, &Map.put(&1, shared_workbook["workbookId"], shared_workbook))
      else
        Agent.update(__MODULE__, &Map.delete(&1, shared_workbook["workbookId"]))
      end
    end
  end

  defp normalize_workbook(owner_id, %{"meta" => meta})
       when is_map(meta) and is_binary(owner_id) do
    with workbook_id when is_binary(workbook_id) and byte_size(workbook_id) > 0 <-
           Map.get(meta, "id"),
         access_role when access_role in ["editor", "viewer"] <-
           Map.get(meta, "sharingAccessRole"),
         sharing_enabled when is_boolean(sharing_enabled) <- Map.get(meta, "sharingEnabled") do
      {:ok,
       %{
         "accessRole" => access_role,
         "ownerId" => owner_id,
         "sharingEnabled" => sharing_enabled,
         "workbookId" => workbook_id
       }}
    else
      _reason -> {:error, :invalid_workbook_payload}
    end
  end

  defp normalize_workbook(_owner_id, _workbook), do: {:error, :invalid_workbook_payload}

  defp parse_shared_workbook(nil), do: nil

  defp parse_shared_workbook(shared_workbook) when is_map(shared_workbook) do
    %{
      accessRole: Map.get(shared_workbook, "accessRole"),
      ownerId: Map.get(shared_workbook, "ownerId"),
      sharingEnabled: Map.get(shared_workbook, "sharingEnabled"),
      workbookId: Map.get(shared_workbook, "workbookId")
    }
  end
end
