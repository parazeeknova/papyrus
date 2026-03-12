defmodule PapyrusCollab.Collaboration.AccessPolicy.TestAdapter do
  @moduledoc false

  @behaviour PapyrusCollab.Collaboration.AccessPolicy

  alias PapyrusCollab.Auth.Identity

  @impl true
  @spec authorize_workbook(Identity.t(), String.t(), String.t()) ::
          {:ok, %{access_role: String.t(), owner_id: String.t(), workbook: map()}}
          | {:error, :forbidden}
  def authorize_workbook(%Identity{user_id: user_id}, _token, workbook_id)
      when is_binary(workbook_id) and byte_size(workbook_id) > 0 do
    responses =
      Application.get_env(:papyrus_collab, __MODULE__, [])
      |> Keyword.get(:responses, %{})

    case Map.get(responses, {user_id, workbook_id}) do
      %{access_role: access_role, owner_id: owner_id, workbook: workbook} ->
        {:ok, %{access_role: access_role, owner_id: owner_id, workbook: workbook}}

      _response ->
        {:error, :forbidden}
    end
  end
end
