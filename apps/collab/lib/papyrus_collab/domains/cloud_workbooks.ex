defmodule PapyrusCollab.CloudWorkbooks do
  @moduledoc false

  alias PapyrusCollab.Auth.Identity
  alias PapyrusCollab.CloudWorkbooks.{LeaseStore, Store}

  @spec acquire_lease(Identity.t(), String.t(), String.t()) :: {:ok, boolean()} | {:error, term()}
  def acquire_lease(%Identity{user_id: user_id}, workbook_id, client_id)
      when is_binary(workbook_id) and byte_size(workbook_id) > 0 and is_binary(client_id) and
             byte_size(client_id) > 0 do
    {:ok, LeaseStore.acquire(user_id, workbook_id, client_id)}
  end

  def acquire_lease(%Identity{}, _workbook_id, _client_id), do: {:error, :invalid_lease_request}

  @spec delete_workbook(Identity.t(), String.t(), String.t()) :: :ok | {:error, term()}
  def delete_workbook(%Identity{user_id: user_id}, token, workbook_id)
      when is_binary(token) and byte_size(token) > 0 and is_binary(workbook_id) and
             byte_size(workbook_id) > 0 do
    with :ok <- PapyrusCollab.SharedWorkbooks.delete_workbook(token, workbook_id),
         :ok <- Store.delete_workbook(user_id, token, workbook_id) do
      LeaseStore.release(user_id, workbook_id)
    end
  end

  def delete_workbook(%Identity{}, _token, _workbook_id), do: {:error, :invalid_workbook_id}

  @spec list_workbooks(Identity.t(), String.t()) :: {:ok, [map()]} | {:error, term()}
  def list_workbooks(%Identity{user_id: user_id}, token)
      when is_binary(token) and byte_size(token) > 0 do
    Store.list_workbooks(user_id, token)
  end

  def list_workbooks(%Identity{}, _token), do: {:error, :invalid_auth_token}

  @spec read_workbook(Identity.t(), String.t(), String.t()) ::
          {:ok, map() | nil} | {:error, term()}
  def read_workbook(%Identity{user_id: user_id}, token, workbook_id)
      when is_binary(token) and byte_size(token) > 0 and is_binary(workbook_id) and
             byte_size(workbook_id) > 0 do
    Store.read_workbook(user_id, token, workbook_id)
  end

  def read_workbook(%Identity{}, _token, _workbook_id), do: {:error, :invalid_workbook_id}

  @spec read_workbook_as_owner(String.t(), String.t(), String.t()) ::
          {:ok, map() | nil} | {:error, term()}
  def read_workbook_as_owner(owner_id, token, workbook_id)
      when is_binary(owner_id) and byte_size(owner_id) > 0 and is_binary(token) and
             byte_size(token) > 0 and is_binary(workbook_id) and byte_size(workbook_id) > 0 do
    Store.read_workbook(owner_id, token, workbook_id)
  end

  def read_workbook_as_owner(_owner_id, _token, _workbook_id),
    do: {:error, :invalid_workbook_id}

  @spec reset() :: :ok
  def reset do
    :ok = LeaseStore.reset()
    :ok = PapyrusCollab.SharedWorkbooks.reset()
    Store.reset()
  end

  @spec write_workbook(Identity.t(), String.t(), map(), String.t()) ::
          {:ok, map()} | {:error, term()}
  def write_workbook(%Identity{user_id: user_id}, token, workbook, client_id)
      when is_binary(token) and byte_size(token) > 0 and is_map(workbook) and is_binary(client_id) and
             byte_size(client_id) > 0 do
    with :ok <- PapyrusCollab.SharedWorkbooks.sync_workbook(user_id, token, workbook) do
      Store.write_workbook(user_id, token, workbook, client_id)
    end
  end

  def write_workbook(%Identity{}, _token, _workbook, _client_id),
    do: {:error, :invalid_workbook_payload}

  @spec write_workbook_as_owner(String.t(), String.t(), map(), String.t()) ::
          {:ok, map()} | {:error, term()}
  def write_workbook_as_owner(owner_id, token, workbook, client_id)
      when is_binary(owner_id) and byte_size(owner_id) > 0 and is_binary(token) and
             byte_size(token) > 0 and is_map(workbook) and is_binary(client_id) and
             byte_size(client_id) > 0 do
    Store.write_workbook(owner_id, token, workbook, client_id)
  end

  def write_workbook_as_owner(_owner_id, _token, _workbook, _client_id),
    do: {:error, :invalid_workbook_payload}
end
