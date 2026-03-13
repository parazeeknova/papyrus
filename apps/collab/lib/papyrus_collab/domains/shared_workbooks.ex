defmodule PapyrusCollab.SharedWorkbooks do
  @moduledoc false

  alias PapyrusCollab.SharedWorkbooks.Store

  @spec delete_workbook(String.t()) :: :ok | {:error, term()}
  def delete_workbook(workbook_id)
      when is_binary(workbook_id) and byte_size(workbook_id) > 0 do
    Store.delete_workbook(workbook_id)
  end

  def delete_workbook(_workbook_id), do: {:error, :invalid_workbook_id}

  @spec read_workbook(String.t()) :: {:ok, map() | nil} | {:error, term()}
  def read_workbook(workbook_id)
      when is_binary(workbook_id) and byte_size(workbook_id) > 0 do
    Store.read_workbook(workbook_id)
  end

  def read_workbook(_workbook_id), do: {:error, :invalid_workbook_id}

  @spec reset() :: :ok
  def reset do
    Store.reset()
  end

  @spec sync_workbook(String.t(), map()) :: :ok | {:error, term()}
  def sync_workbook(owner_id, workbook)
      when is_binary(owner_id) and byte_size(owner_id) > 0 and is_map(workbook) do
    Store.sync_workbook(owner_id, workbook)
  end

  def sync_workbook(_owner_id, _workbook), do: {:error, :invalid_workbook_payload}
end
