defmodule PapyrusCollab.Collaboration.AccessPolicy.CloudWorkbooks do
  @moduledoc false

  @behaviour PapyrusCollab.Collaboration.AccessPolicy

  alias PapyrusCollab.Auth.Identity
  alias PapyrusCollab.{CloudWorkbooks, SharedWorkbooks}

  @impl true
  @spec authorize_workbook(Identity.t(), String.t(), String.t()) ::
          {:ok, %{access_role: String.t(), owner_id: String.t(), workbook: map()}}
          | {:error, :forbidden | term()}
  def authorize_workbook(%Identity{} = identity, token, workbook_id)
      when is_binary(token) and byte_size(token) > 0 and is_binary(workbook_id) and
             byte_size(workbook_id) > 0 do
    case CloudWorkbooks.read_workbook(identity, token, workbook_id) do
      {:ok, nil} ->
        authorize_shared_workbook(identity, token, workbook_id)

      {:ok, workbook} ->
        {:ok, %{access_role: "editor", owner_id: identity.user_id, workbook: workbook}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp authorize_shared_workbook(%Identity{} = identity, token, workbook_id) do
    with {:ok, %{ownerId: owner_id, accessRole: access_role, sharingEnabled: true}} <-
           SharedWorkbooks.read_workbook(token, workbook_id),
         false <- owner_id == identity.user_id,
         {:ok, %{} = workbook} <-
           CloudWorkbooks.read_workbook_as_owner(owner_id, token, workbook_id) do
      {:ok, %{access_role: access_role, owner_id: owner_id, workbook: workbook}}
    else
      {:ok, nil} -> {:error, :forbidden}
      true -> {:error, :forbidden}
      false -> {:error, :forbidden}
      {:ok, %{sharingEnabled: false}} -> {:error, :forbidden}
      {:error, reason} -> {:error, reason}
      _reason -> {:error, :forbidden}
    end
  end
end
