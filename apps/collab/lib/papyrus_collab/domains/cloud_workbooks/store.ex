defmodule PapyrusCollab.CloudWorkbooks.Store do
  @moduledoc false

  @callback delete_workbook(String.t(), String.t(), String.t()) :: :ok | {:error, term()}
  @callback list_workbooks(String.t(), String.t()) :: {:ok, [map()]} | {:error, term()}
  @callback read_workbook(String.t(), String.t(), String.t()) ::
              {:ok, map() | nil} | {:error, term()}
  @callback write_workbook(String.t(), String.t(), map(), String.t()) ::
              {:ok, map()} | {:error, term()}

  @spec delete_workbook(String.t(), String.t(), String.t()) :: :ok | {:error, term()}
  def delete_workbook(user_id, token, workbook_id)
      when is_binary(user_id) and is_binary(token) and is_binary(workbook_id) do
    adapter().delete_workbook(user_id, token, workbook_id)
  end

  @spec list_workbooks(String.t(), String.t()) :: {:ok, [map()]} | {:error, term()}
  def list_workbooks(user_id, token) when is_binary(user_id) and is_binary(token) do
    adapter().list_workbooks(user_id, token)
  end

  @spec read_workbook(String.t(), String.t(), String.t()) :: {:ok, map() | nil} | {:error, term()}
  def read_workbook(user_id, token, workbook_id)
      when is_binary(user_id) and is_binary(token) and is_binary(workbook_id) do
    adapter().read_workbook(user_id, token, workbook_id)
  end

  @spec reset() :: :ok
  def reset do
    store_adapter = adapter()

    if function_exported?(store_adapter, :reset, 0) do
      store_adapter.reset()
    else
      :ok
    end
  end

  @spec write_workbook(String.t(), String.t(), map(), String.t()) ::
          {:ok, map()} | {:error, term()}
  def write_workbook(user_id, token, workbook, client_id)
      when is_binary(user_id) and is_binary(token) and is_map(workbook) and is_binary(client_id) do
    adapter().write_workbook(user_id, token, workbook, client_id)
  end

  @spec adapter() :: module()
  def adapter do
    Application.fetch_env!(:papyrus_collab, __MODULE__)[:adapter]
  end
end
