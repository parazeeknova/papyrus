defmodule PapyrusCollab.SharedWorkbooks.Store.Firestore do
  @moduledoc false

  @behaviour PapyrusCollab.SharedWorkbooks.Store

  @impl true
  @spec delete_workbook(String.t(), String.t()) :: :ok | {:error, term()}
  def delete_workbook(token, workbook_id)
      when is_binary(token) and is_binary(workbook_id) do
    case request(token, :delete, shared_workbook_document_path(workbook_id)) do
      :not_found -> :ok
      {:ok, _body} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  @impl true
  @spec read_workbook(String.t(), String.t()) :: {:ok, map() | nil} | {:error, term()}
  def read_workbook(token, workbook_id)
      when is_binary(token) and is_binary(workbook_id) do
    case request(token, :get, shared_workbook_document_path(workbook_id)) do
      {:ok, %{"name" => _name} = body} -> parse_shared_workbook(body)
      :not_found -> {:ok, nil}
      {:error, reason} -> {:error, reason}
    end
  end

  @impl true
  @spec reset() :: :ok
  def reset do
    :ok
  end

  @impl true
  @spec sync_workbook(String.t(), String.t(), map()) :: :ok | {:error, term()}
  def sync_workbook(owner_id, token, workbook)
      when is_binary(owner_id) and is_binary(token) and is_map(workbook) do
    with {:ok, shared_workbook} <- normalize_workbook(owner_id, workbook) do
      if shared_workbook["sharingEnabled"] do
        patch_document(
          token,
          shared_workbook_document_path(shared_workbook["workbookId"]),
          build_shared_workbook_document(shared_workbook)
        )
      else
        delete_workbook(token, shared_workbook["workbookId"])
      end
    end
  end

  defp build_field_value(value) when is_binary(value), do: %{"stringValue" => value}
  defp build_field_value(value) when is_boolean(value), do: %{"booleanValue" => value}

  defp build_shared_workbook_document(shared_workbook) do
    %{
      "fields" => %{
        "accessRole" => build_field_value(shared_workbook["accessRole"]),
        "ownerId" => build_field_value(shared_workbook["ownerId"]),
        "sharingEnabled" => build_field_value(shared_workbook["sharingEnabled"]),
        "workbookId" => build_field_value(shared_workbook["workbookId"])
      }
    }
  end

  defp document_response_fields(%{"fields" => fields}) when is_map(fields), do: {:ok, fields}
  defp document_response_fields(_document), do: :error

  defp fetch_boolean_field(fields, key) when is_map(fields) and is_binary(key) do
    case get_in(fields, [key, "booleanValue"]) do
      value when is_boolean(value) -> {:ok, value}
      _value -> :error
    end
  end

  defp fetch_string_field(fields, key) when is_map(fields) and is_binary(key) do
    case get_in(fields, [key, "stringValue"]) do
      value when is_binary(value) and byte_size(value) > 0 -> {:ok, value}
      _value -> :error
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

  defp parse_shared_workbook(document) do
    with {:ok, fields} <- document_response_fields(document),
         {:ok, access_role} <- fetch_string_field(fields, "accessRole"),
         {:ok, owner_id} <- fetch_string_field(fields, "ownerId"),
         {:ok, sharing_enabled} <- fetch_boolean_field(fields, "sharingEnabled"),
         {:ok, workbook_id} <- fetch_string_field(fields, "workbookId") do
      {:ok,
       %{
         accessRole: access_role,
         ownerId: owner_id,
         sharingEnabled: sharing_enabled,
         workbookId: workbook_id
       }}
    else
      _reason -> {:error, :invalid_shared_workbook}
    end
  end

  defp patch_document(token, path, body) do
    case request(token, :patch, path, json: body) do
      {:ok, _body} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  defp request(token, method, path, options \\ [])

  defp request(token, method, path, options)
       when is_binary(token) and is_atom(method) and is_binary(path) and is_list(options) do
    request_options =
      [
        auth: {:bearer, token},
        headers: [{"content-type", "application/json"}],
        method: method,
        receive_timeout: 10_000,
        url: base_url() <> path
      ] ++ options

    case Req.request(request_options) do
      {:ok, %Req.Response{status: 404}} ->
        :not_found

      {:ok, %Req.Response{status: status, body: body}} when status in 200..299 ->
        {:ok, body}

      {:ok, %Req.Response{status: status, body: body}} ->
        {:error, {:firestore_http, status, body}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp shared_workbook_document_path(workbook_id) do
    "/sharedWorkbooks/#{URI.encode(workbook_id)}"
  end

  defp base_url do
    "https://firestore.googleapis.com/v1/projects/#{fetch_project_id()}/databases/(default)/documents"
  end

  defp fetch_project_id do
    Application.get_env(:papyrus_collab, __MODULE__, [])[:project_id] ||
      Application.get_env(:papyrus_collab, PapyrusCollab.Firebase.IdTokenVerifier, [])[
        :project_id
      ] ||
      raise ArgumentError, "FIREBASE_PROJECT_ID is required for shared workbook sync"
  end
end
