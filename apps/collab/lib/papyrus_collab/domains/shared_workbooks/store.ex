defmodule PapyrusCollab.SharedWorkbooks.Store do
  @moduledoc false

  @callback delete_workbook(String.t()) :: :ok | {:error, term()}
  @callback read_workbook(String.t()) :: {:ok, map() | nil} | {:error, term()}
  @callback reset() :: :ok
  @callback sync_workbook(String.t(), map()) :: :ok | {:error, term()}

  @spec delete_workbook(String.t()) :: :ok | {:error, term()}
  def delete_workbook(workbook_id) when is_binary(workbook_id) do
    adapter().delete_workbook(workbook_id)
  end

  @spec read_workbook(String.t()) :: {:ok, map() | nil} | {:error, term()}
  def read_workbook(workbook_id) when is_binary(workbook_id) do
    adapter().read_workbook(workbook_id)
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

  @spec sync_workbook(String.t(), map()) :: :ok | {:error, term()}
  def sync_workbook(owner_id, workbook)
      when is_binary(owner_id) and is_map(workbook) do
    adapter().sync_workbook(owner_id, workbook)
  end

  @spec adapter() :: module()
  def adapter do
    Application.fetch_env!(:papyrus_collab, __MODULE__)[:adapter]
  end
end
