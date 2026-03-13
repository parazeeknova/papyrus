defmodule PapyrusCollab.CloudWorkbooks.Store.InMemory do
  @moduledoc false

  use Agent

  @behaviour PapyrusCollab.CloudWorkbooks.Store

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
  @spec delete_workbook(String.t(), String.t()) :: :ok
  def delete_workbook(user_id, workbook_id)
      when is_binary(user_id) and is_binary(workbook_id) do
    Agent.update(__MODULE__, &Map.delete(&1, {user_id, workbook_id}))
  end

  @impl true
  @spec list_workbooks(String.t()) :: {:ok, [map()]}
  def list_workbooks(user_id) when is_binary(user_id) do
    workbooks =
      __MODULE__
      |> Agent.get(fn records ->
        for {{record_user_id, _workbook_id}, workbook} <- records,
            record_user_id == user_id do
          workbook["meta"]
        end
      end)
      |> Enum.sort_by(& &1["updatedAt"], :desc)

    {:ok, workbooks}
  end

  @impl true
  @spec read_workbook(String.t(), String.t()) :: {:ok, map() | nil}
  def read_workbook(user_id, workbook_id)
      when is_binary(user_id) and is_binary(workbook_id) do
    {:ok, Agent.get(__MODULE__, &Map.get(&1, {user_id, workbook_id}))}
  end

  @spec reset() :: :ok
  def reset do
    Agent.update(__MODULE__, fn _records -> %{} end)
  end

  @impl true
  @spec write_workbook(String.t(), map(), String.t()) ::
          {:ok, map()} | {:error, term()}
  def write_workbook(user_id, workbook, _client_id)
      when is_binary(user_id) and is_map(workbook) do
    with {:ok, normalized_workbook} <- normalize_workbook_payload(workbook) do
      now = DateTime.utc_now() |> DateTime.to_iso8601()

      persisted_workbook =
        Agent.get_and_update(__MODULE__, fn records ->
          key = {user_id, normalized_workbook["meta"]["id"]}
          stored_workbook = Map.get(records, key)
          stored_version = (stored_workbook && stored_workbook["version"]) || 0
          next_version = max(stored_version, normalized_workbook["version"]) + 1

          persisted_workbook =
            normalized_workbook
            |> put_in(["meta", "lastSyncedAt"], now)
            |> put_in(["meta", "remoteVersion"], next_version)
            |> Map.put("version", next_version)

          {persisted_workbook, Map.put(records, key, persisted_workbook)}
        end)

      {:ok,
       %{
         lastSyncedAt: persisted_workbook["meta"]["lastSyncedAt"],
         version: persisted_workbook["version"]
       }}
    end
  end

  defp normalize_workbook_payload(workbook) do
    with {:ok, active_sheet_id} <- fetch_optional_string(workbook, "activeSheetId"),
         {:ok, meta} <- normalize_workbook_meta(Map.get(workbook, "meta")),
         {:ok, update_base64} <- fetch_string(workbook, "updateBase64"),
         {:ok, version} <- fetch_integer(workbook, "version") do
      {:ok,
       %{
         "activeSheetId" => active_sheet_id,
         "meta" => meta,
         "updateBase64" => update_base64,
         "version" => version
       }}
    end
  end

  defp normalize_workbook_meta(meta) when is_map(meta) do
    with {:ok, created_at} <- fetch_string(meta, "createdAt"),
         {:ok, workbook_id} <- fetch_string(meta, "id"),
         {:ok, is_favorite} <- fetch_boolean(meta, "isFavorite"),
         {:ok, last_opened_at} <- fetch_string(meta, "lastOpenedAt"),
         {:ok, name} <- fetch_string(meta, "name"),
         {:ok, sharing_access_role} <- fetch_string(meta, "sharingAccessRole"),
         {:ok, sharing_enabled} <- fetch_boolean(meta, "sharingEnabled"),
         {:ok, updated_at} <- fetch_string(meta, "updatedAt") do
      {:ok,
       %{
         "createdAt" => created_at,
         "id" => workbook_id,
         "isFavorite" => is_favorite,
         "lastOpenedAt" => last_opened_at,
         "lastSyncedAt" => fetch_optional_value(meta, "lastSyncedAt"),
         "name" => name,
         "remoteVersion" => fetch_optional_integer(meta, "remoteVersion"),
         "sharingAccessRole" => sharing_access_role,
         "sharingEnabled" => sharing_enabled,
         "updatedAt" => updated_at
       }}
    end
  end

  defp normalize_workbook_meta(_meta), do: {:error, :invalid_workbook_meta}

  defp fetch_boolean(map, key) when is_map(map) and is_binary(key) do
    case Map.get(map, key) do
      value when is_boolean(value) -> {:ok, value}
      _value -> {:error, {:invalid_boolean, key}}
    end
  end

  defp fetch_integer(map, key) when is_map(map) and is_binary(key) do
    case Map.get(map, key) do
      value when is_integer(value) and value >= 0 -> {:ok, value}
      _value -> {:error, {:invalid_integer, key}}
    end
  end

  defp fetch_optional_integer(map, key) when is_map(map) and is_binary(key) do
    case Map.get(map, key) do
      nil -> nil
      value when is_integer(value) and value >= 0 -> value
      _value -> nil
    end
  end

  defp fetch_optional_string(map, key) when is_map(map) and is_binary(key) do
    case Map.get(map, key) do
      nil -> {:ok, nil}
      value when is_binary(value) and byte_size(value) > 0 -> {:ok, value}
      _value -> {:error, {:invalid_string, key}}
    end
  end

  defp fetch_optional_value(map, key) when is_map(map) and is_binary(key) do
    case Map.get(map, key) do
      value when is_binary(value) -> value
      nil -> nil
      _value -> nil
    end
  end

  defp fetch_string(map, key) when is_map(map) and is_binary(key) do
    case Map.get(map, key) do
      value when is_binary(value) and byte_size(value) > 0 -> {:ok, value}
      _value -> {:error, {:invalid_string, key}}
    end
  end
end
