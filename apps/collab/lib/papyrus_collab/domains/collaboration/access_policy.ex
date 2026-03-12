defmodule PapyrusCollab.Collaboration.AccessPolicy do
  @moduledoc false

  alias PapyrusCollab.Auth.Identity

  @callback authorize_workbook(Identity.t(), String.t(), String.t()) ::
              {:ok, %{access_role: String.t(), owner_id: String.t(), workbook: map()}}
              | {:error, :forbidden | term()}

  @spec authorize_workbook(Identity.t(), String.t(), String.t()) ::
          {:ok, %{access_role: String.t(), owner_id: String.t(), workbook: map()}}
          | {:error, :forbidden | term()}
  def authorize_workbook(%Identity{} = identity, token, workbook_id)
      when is_binary(token) and byte_size(token) > 0 and is_binary(workbook_id) and
             byte_size(workbook_id) > 0 do
    adapter().authorize_workbook(identity, token, workbook_id)
  end

  @spec adapter() :: module()
  def adapter do
    Application.fetch_env!(:papyrus_collab, __MODULE__)[:adapter]
  end
end
