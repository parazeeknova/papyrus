defmodule PapyrusCollab.CloudWorkbooks.Store.Firestore do
  @moduledoc false

  @behaviour PapyrusCollab.CloudWorkbooks.Store

  alias PapyrusCollab.Platform.Google.AccessTokenProvider

  @chunk_size 600_000
  @page_size 1000

  @impl true
  @spec delete_workbook(String.t(), String.t()) :: :ok | {:error, term()}
  def delete_workbook(user_id, workbook_id)
      when is_binary(user_id) and is_binary(workbook_id) do
    with {:ok, access_token} <- fetch_access_token(),
         {:ok, chunk_documents} <-
           list_documents(access_token, chunk_collection_path(user_id, workbook_id)),
         :ok <- delete_documents(access_token, chunk_documents) do
      delete_document(access_token, workbook_document_path(user_id, workbook_id))
    end
  end

  @impl true
  @spec list_workbooks(String.t()) :: {:ok, [map()]} | {:error, term()}
  def list_workbooks(user_id) when is_binary(user_id) do
    with {:ok, access_token} <- fetch_access_token(),
         {:ok, documents} <- list_documents(access_token, workbook_collection_path(user_id)) do
      {:ok,
       documents
       |> Enum.flat_map(fn document ->
         case parse_workbook_meta(document) do
           {:ok, meta} -> [meta]
           :error -> []
         end
       end)}
    end
  end

  @impl true
  @spec read_workbook(String.t(), String.t()) :: {:ok, map() | nil} | {:error, term()}
  def read_workbook(user_id, workbook_id)
      when is_binary(user_id) and is_binary(workbook_id) do
    with {:ok, access_token} <- fetch_access_token() do
      load_remote_workbook(access_token, user_id, workbook_id)
    end
  end

  @impl true
  @spec write_workbook(String.t(), map(), String.t()) ::
          {:ok, map()} | {:error, term()}
  def write_workbook(user_id, workbook, _client_id)
      when is_binary(user_id) and is_map(workbook) do
    with {:ok, access_token} <- fetch_access_token(),
         {:ok, normalized_workbook} <- normalize_workbook_payload(workbook),
         workbook_id <- get_in(normalized_workbook, ["meta", "id"]),
         {:ok, existing_workbook} <-
           get_document(access_token, workbook_document_path(user_id, workbook_id)),
         {:ok, existing_chunk_documents} <-
           list_documents(access_token, chunk_collection_path(user_id, workbook_id)) do
      existing_version = extract_document_version(existing_workbook)
      next_version = max(existing_version, normalized_workbook["version"]) + 1
      last_synced_at = DateTime.utc_now() |> DateTime.to_iso8601()
      snapshot_id = "#{System.system_time(:millisecond)}-#{next_version}"
      chunk_values = chunk_string(normalized_workbook["updateBase64"], @chunk_size)

      next_chunk_ids =
        chunk_values
        |> Enum.with_index()
        |> Enum.map(&chunk_document_id(elem(&1, 1)))
        |> MapSet.new()

      # Write the next chunk set before flipping the parent snapshot pointer so
      # readers continue to see a coherent snapshot during the transition.
      with :ok <-
             write_chunk_documents(
               access_token,
               user_id,
               workbook_id,
               chunk_values,
               snapshot_id
             ),
           :ok <-
             patch_document(
               access_token,
               workbook_document_path(user_id, workbook_id),
               build_workbook_document(
                 normalized_workbook,
                 last_synced_at,
                 next_version,
                 snapshot_id,
                 length(chunk_values)
               )
             ),
           :ok <-
             delete_stale_chunk_documents(
               access_token,
               existing_chunk_documents,
               next_chunk_ids
             ) do
        {:ok, %{lastSyncedAt: last_synced_at, version: next_version}}
      end
    end
  end

  defp build_field_value(nil), do: %{"nullValue" => nil}
  defp build_field_value(value) when is_binary(value), do: %{"stringValue" => value}
  defp build_field_value(value) when is_boolean(value), do: %{"booleanValue" => value}

  defp build_field_value(value) when is_integer(value),
    do: %{"integerValue" => Integer.to_string(value)}

  defp fetch_access_token do
    AccessTokenProvider.fetch_token()
  end

  defp load_remote_workbook(access_token, user_id, workbook_id) do
    with {:ok, document} <-
           get_document(access_token, workbook_document_path(user_id, workbook_id)),
         false <- is_nil(document),
         {:ok, chunk_documents} <-
           list_documents(access_token, chunk_collection_path(user_id, workbook_id)) do
      parse_remote_workbook(document, chunk_documents)
    else
      true -> {:ok, nil}
      {:error, reason} -> {:error, reason}
    end
  end

  defp build_workbook_document(workbook, last_synced_at, version, snapshot_id, chunk_count) do
    meta = workbook["meta"]

    %{
      "fields" => %{
        "activeSheetId" => build_field_value(workbook["activeSheetId"]),
        "createdAt" => build_field_value(meta["createdAt"]),
        "id" => build_field_value(meta["id"]),
        "isFavorite" => build_field_value(meta["isFavorite"]),
        "lastOpenedAt" => build_field_value(meta["lastOpenedAt"]),
        "lastSyncedAt" => build_field_value(last_synced_at),
        "name" => build_field_value(meta["name"]),
        "remoteVersion" => build_field_value(version),
        "sharingAccessRole" => build_field_value(meta["sharingAccessRole"]),
        "sharingEnabled" => build_field_value(meta["sharingEnabled"]),
        "snapshotChunkCount" => build_field_value(chunk_count),
        "snapshotId" => build_field_value(snapshot_id),
        "updatedAt" => build_field_value(meta["updatedAt"]),
        "version" => build_field_value(version)
      }
    }
  end

  defp chunk_collection_path(user_id, workbook_id) do
    workbook_document_path(user_id, workbook_id) <> "/chunks?pageSize=#{@page_size}"
  end

  defp chunk_document_id(index) when is_integer(index) and index >= 0 do
    index
    |> Integer.to_string()
    |> String.pad_leading(4, "0")
  end

  defp chunk_document_path(user_id, workbook_id, index)
       when is_binary(user_id) and is_binary(workbook_id) and is_integer(index) do
    workbook_document_path(user_id, workbook_id) <> "/chunks/" <> chunk_document_id(index)
  end

  defp chunk_string(value, chunk_size)
       when is_binary(value) and is_integer(chunk_size) and chunk_size > 0 do
    Stream.unfold(0, fn offset ->
      if offset < byte_size(value) do
        next_offset = offset + chunk_size

        {
          binary_part(value, offset, min(chunk_size, byte_size(value) - offset)),
          next_offset
        }
      else
        nil
      end
    end)
    |> Enum.to_list()
  end

  defp chunk_value_document(chunk, index, snapshot_id) do
    %{
      "fields" => %{
        "data" => build_field_value(chunk),
        "index" => build_field_value(index),
        "snapshotId" => build_field_value(snapshot_id)
      }
    }
  end

  defp delete_document(token, path) do
    case request(token, :delete, path) do
      :not_found -> :ok
      {:ok, _body} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  defp delete_documents(_token, []), do: :ok

  defp delete_documents(token, documents) do
    documents
    |> Enum.reduce_while(:ok, fn document, :ok ->
      case delete_document(token, document_path_from_name(document["name"])) do
        :ok -> {:cont, :ok}
        {:error, reason} -> {:halt, {:error, reason}}
      end
    end)
  end

  defp delete_stale_chunk_documents(_token, [], _next_chunk_ids), do: :ok

  defp delete_stale_chunk_documents(token, existing_chunk_documents, next_chunk_ids) do
    documents_to_delete =
      Enum.reject(existing_chunk_documents, fn document ->
        document
        |> Map.get("name")
        |> document_id_from_name()
        |> then(&MapSet.member?(next_chunk_ids, &1))
      end)

    delete_documents(token, documents_to_delete)
  end

  defp document_id_from_name(name) when is_binary(name) do
    name
    |> String.split("/")
    |> List.last()
  end

  defp document_path_from_name(name) when is_binary(name) do
    case String.split(name, "/documents", parts: 2) do
      [_prefix, path] when is_binary(path) and byte_size(path) > 0 -> path
      _parts -> name
    end
  end

  defp document_response_fields(%{"fields" => fields}) when is_map(fields), do: {:ok, fields}
  defp document_response_fields(_document), do: :error

  defp extract_document_version(nil), do: 0

  defp extract_document_version(document) when is_map(document) do
    with {:ok, fields} <- document_response_fields(document),
         {:ok, version} <- fetch_integer_field(fields, "version") do
      version
    else
      _reason -> 0
    end
  end

  defp fetch_boolean_field(fields, key) when is_map(fields) and is_binary(key) do
    case get_in(fields, [key, "booleanValue"]) do
      value when is_boolean(value) -> {:ok, value}
      _value -> :error
    end
  end

  defp fetch_integer_field(fields, key) when is_map(fields) and is_binary(key) do
    case get_in(fields, [key, "integerValue"]) do
      value when is_binary(value) ->
        case Integer.parse(value) do
          {parsed_value, ""} -> {:ok, parsed_value}
          _reason -> :error
        end

      value when is_integer(value) ->
        {:ok, value}

      _value ->
        :error
    end
  end

  defp fetch_optional_string_field(fields, key) when is_map(fields) and is_binary(key) do
    value = get_in(fields, [key, "stringValue"])

    cond do
      is_binary(value) and byte_size(value) > 0 -> {:ok, value}
      Map.has_key?(fields, key) -> {:ok, nil}
      true -> {:ok, nil}
    end
  end

  defp fetch_string_field(fields, key) when is_map(fields) and is_binary(key) do
    case get_in(fields, [key, "stringValue"]) do
      value when is_binary(value) and byte_size(value) > 0 -> {:ok, value}
      _value -> :error
    end
  end

  defp get_document(token, path) do
    case request(token, :get, path) do
      {:ok, %{"name" => _name} = body} -> {:ok, body}
      :not_found -> {:ok, nil}
      {:error, reason} -> {:error, reason}
    end
  end

  defp list_documents(token, path) do
    case request(token, :get, path) do
      {:ok, %{"documents" => documents}} when is_list(documents) -> {:ok, documents}
      {:ok, _body} -> {:ok, []}
      :not_found -> {:ok, []}
      {:error, reason} -> {:error, reason}
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

  defp normalize_workbook_payload(workbook) when is_map(workbook) do
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

  defp parse_chunk(document) do
    with {:ok, fields} <- document_response_fields(document),
         {:ok, data} <- fetch_string_field(fields, "data"),
         {:ok, index} <- fetch_integer_field(fields, "index"),
         {:ok, snapshot_id} <- fetch_string_field(fields, "snapshotId") do
      {:ok, %{data: data, index: index, snapshot_id: snapshot_id}}
    else
      _reason -> :error
    end
  end

  defp parse_remote_workbook(document, chunk_documents) do
    with {:ok, fields} <- document_response_fields(document),
         {:ok, active_sheet_id} <- fetch_optional_string_field(fields, "activeSheetId"),
         {:ok, meta} <- parse_workbook_meta(document),
         {:ok, snapshot_chunk_count} <- fetch_integer_field(fields, "snapshotChunkCount"),
         {:ok, snapshot_id} <- fetch_string_field(fields, "snapshotId"),
         {:ok, version} <- fetch_integer_field(fields, "version"),
         {:ok, update_base64} <-
           build_snapshot_update_base64(
             chunk_documents,
             snapshot_id,
             snapshot_chunk_count
           ) do
      {:ok,
       %{
         activeSheetId: active_sheet_id,
         meta: meta,
         updateBase64: update_base64,
         version: version
       }}
    end
  end

  defp build_snapshot_update_base64(chunk_documents, snapshot_id, snapshot_chunk_count) do
    chunks =
      chunk_documents
      |> Enum.flat_map(fn chunk_document ->
        case parse_chunk(chunk_document) do
          {:ok, %{snapshot_id: ^snapshot_id} = chunk} -> [chunk]
          _other -> []
        end
      end)
      |> Enum.sort_by(& &1.index)

    if length(chunks) == snapshot_chunk_count do
      {:ok, Enum.map_join(chunks, "", & &1.data)}
    else
      {:error, :invalid_snapshot_chunks}
    end
  end

  defp parse_workbook_meta(document) do
    with {:ok, fields} <- document_response_fields(document),
         {:ok, created_at} <- fetch_string_field(fields, "createdAt"),
         {:ok, workbook_id} <- fetch_string_field(fields, "id"),
         {:ok, is_favorite} <- fetch_boolean_field(fields, "isFavorite"),
         {:ok, last_opened_at} <- fetch_string_field(fields, "lastOpenedAt"),
         {:ok, last_synced_at} <- fetch_optional_string_field(fields, "lastSyncedAt"),
         {:ok, name} <- fetch_string_field(fields, "name"),
         {:ok, sharing_access_role} <- fetch_string_field(fields, "sharingAccessRole"),
         {:ok, sharing_enabled} <- fetch_boolean_field(fields, "sharingEnabled"),
         {:ok, updated_at} <- fetch_string_field(fields, "updatedAt"),
         {:ok, version} <- fetch_integer_field(fields, "version") do
      {:ok,
       %{
         createdAt: created_at,
         id: workbook_id,
         isFavorite: is_favorite,
         lastOpenedAt: last_opened_at,
         lastSyncedAt: last_synced_at,
         name: name,
         remoteVersion: version,
         sharingAccessRole: sharing_access_role,
         sharingEnabled: sharing_enabled,
         updatedAt: updated_at
       }}
    else
      _reason -> :error
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
    with {:ok, firestore_base_url} <- base_url() do
      request_options =
        [
          auth: {:bearer, token},
          headers: [{"content-type", "application/json"}],
          method: method,
          receive_timeout: 10_000,
          url: firestore_base_url <> path
        ] ++ options

      case requester().(request_options) do
        :not_found ->
          :not_found

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
  end

  defp base_url do
    with {:ok, project_id} <- fetch_project_id() do
      {:ok,
       "https://firestore.googleapis.com/v1/projects/#{project_id}/databases/(default)/documents"}
    end
  end

  defp fetch_project_id do
    project_id =
      Application.get_env(:papyrus_collab, __MODULE__, [])[:project_id] ||
        Application.get_env(:papyrus_collab, PapyrusCollab.Firebase.IdTokenVerifier, [])[
          :project_id
        ]

    if is_binary(project_id) and String.trim(project_id) != "" do
      {:ok, project_id}
    else
      {:error, :missing_firebase_project_id}
    end
  end

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

  defp requester do
    Application.get_env(:papyrus_collab, __MODULE__, [])[:requester] || (&Req.request/1)
  end

  defp write_chunk_documents(token, user_id, workbook_id, chunk_values, snapshot_id) do
    chunk_values
    |> Enum.with_index()
    |> Enum.reduce_while(:ok, fn {chunk, index}, :ok ->
      case patch_document(
             token,
             chunk_document_path(user_id, workbook_id, index),
             chunk_value_document(chunk, index, snapshot_id)
           ) do
        :ok -> {:cont, :ok}
        {:error, reason} -> {:halt, {:error, reason}}
      end
    end)
  end

  defp workbook_collection_path(user_id) do
    "/users/#{URI.encode(user_id)}/workbooks?pageSize=#{@page_size}"
  end

  defp workbook_document_path(user_id, workbook_id) do
    "/users/#{URI.encode(user_id)}/workbooks/#{URI.encode(workbook_id)}"
  end

  defp fetch_optional_value(map, key) when is_map(map) and is_binary(key) do
    case Map.get(map, key) do
      nil -> nil
      value when is_binary(value) -> value
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
