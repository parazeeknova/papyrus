defmodule PapyrusCollab.Collaboration.AccessPolicy.CloudWorkbooks do
  @moduledoc false

  @behaviour PapyrusCollab.Collaboration.AccessPolicy

  alias PapyrusCollab.Auth.Identity
  alias PapyrusCollab.CloudWorkbooks

  @impl true
  @spec authorize_workbook(Identity.t(), String.t(), String.t()) ::
          {:ok, %{access_role: String.t(), workbook: map()}} | {:error, :forbidden | term()}
  def authorize_workbook(%Identity{} = identity, token, workbook_id)
      when is_binary(token) and byte_size(token) > 0 and is_binary(workbook_id) and
             byte_size(workbook_id) > 0 do
    # Shared-user authorization will plug in here once the backend share policy
    # exists. For now, only the authenticated owner's workbook namespace can
    # participate in realtime editing.
    case CloudWorkbooks.read_workbook(identity, token, workbook_id) do
      {:ok, nil} -> {:error, :forbidden}
      {:ok, workbook} -> {:ok, %{access_role: "editor", workbook: workbook}}
      {:error, reason} -> {:error, reason}
    end
  end
end
