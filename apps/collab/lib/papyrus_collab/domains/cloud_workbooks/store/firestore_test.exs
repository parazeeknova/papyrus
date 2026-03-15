defmodule PapyrusCollab.CloudWorkbooks.Store.FirestoreTest do
  use ExUnit.Case, async: false

  alias PapyrusCollab.CloudWorkbooks.Store.Firestore
  alias PapyrusCollab.Platform.Google.AccessTokenProvider

  defmodule AccessTokenProviderStub do
    @behaviour AccessTokenProvider

    @impl true
    def fetch_token do
      {:ok, "server-token"}
    end
  end

  defmodule FailingAccessTokenProviderStub do
    @behaviour AccessTokenProvider

    @impl true
    def fetch_token do
      {:error, :token_unavailable}
    end
  end

  setup do
    previous_store_config = Application.get_env(:papyrus_collab, Firestore, [])
    previous_provider_config = Application.get_env(:papyrus_collab, AccessTokenProvider, [])
    test_pid = self()

    Application.put_env(
      :papyrus_collab,
      AccessTokenProvider,
      adapter: AccessTokenProviderStub
    )

    Application.put_env(
      :papyrus_collab,
      Firestore,
      project_id: "papyrus-test",
      requester: fn options ->
        send(test_pid, {:firestore_request, options})
        firestore_response(options)
      end
    )

    on_exit(fn ->
      Application.put_env(:papyrus_collab, Firestore, previous_store_config)

      Application.put_env(
        :papyrus_collab,
        AccessTokenProvider,
        previous_provider_config
      )
    end)

    :ok
  end

  test "lists only valid workbook metadata documents" do
    put_request_responses(%{
      {:get, workbooks_url("user-1")} =>
        {:ok, response(200, %{"documents" => [valid_document(), %{}]})}
    })

    assert {:ok, [workbook]} = Firestore.list_workbooks("user-1")
    assert workbook.id == "workbook-1"
    assert workbook.remoteVersion == 3
  end

  test "reads a remote workbook snapshot and returns nil for missing workbooks" do
    put_request_responses(%{
      {:get, workbook_url("user-1", "workbook-1")} => {:ok, response(200, valid_document())},
      {:get, chunks_url("user-1", "workbook-1")} =>
        {:ok,
         response(200, %{
           "documents" => [
             chunk_document(1, "BBB", "snapshot-3"),
             chunk_document(0, "AAA", "snapshot-3"),
             chunk_document(0, "ignored", "snapshot-2")
           ]
         })}
    })

    assert {:ok, workbook} = Firestore.read_workbook("user-1", "workbook-1")

    assert workbook == %{
             activeSheetId: "sheet-1",
             meta: %{
               createdAt: "2026-03-13T00:00:00.000Z",
               id: "workbook-1",
               isFavorite: false,
               lastOpenedAt: "2026-03-13T01:00:00.000Z",
               lastSyncedAt: "2026-03-13T02:00:00.000Z",
               name: "Budget",
               remoteVersion: 3,
               sharingAccessRole: "viewer",
               sharingEnabled: true,
               updatedAt: "2026-03-13T01:00:00.000Z"
             },
             updateBase64: "AAABBB",
             version: 3
           }

    put_request_responses(%{
      {:get, workbook_url("user-1", "missing-workbook")} => :not_found
    })

    assert {:ok, nil} = Firestore.read_workbook("user-1", "missing-workbook")
  end

  test "writes chunked workbook snapshots and deletes stale chunks" do
    first_chunk_url = chunk_url("user-1", "workbook-1", 0)
    stale_chunk_url = chunk_url("user-1", "workbook-1", 2)
    workbook_document_url = workbook_url("user-1", "workbook-1")

    put_request_responses(%{
      {:get, workbook_document_url} => {:ok, response(200, valid_document())},
      {:get, chunks_url("user-1", "workbook-1")} =>
        {:ok,
         response(200, %{
           "documents" => [
             chunk_name_document("users/user-1/workbooks/workbook-1/chunks/0000"),
             chunk_name_document("users/user-1/workbooks/workbook-1/chunks/0002")
           ]
         })},
      {:patch, first_chunk_url} => {:ok, response(200, %{})},
      {:patch, workbook_document_url} => {:ok, response(200, %{})},
      {:delete, stale_chunk_url} => {:ok, response(200, %{})}
    })

    assert {:ok, %{lastSyncedAt: last_synced_at, version: 4}} =
             Firestore.write_workbook("user-1", workbook_payload("AAA"), "client-1")

    assert is_binary(last_synced_at)

    assert_receive {:firestore_request, first_read_request}
    assert Keyword.fetch!(first_read_request, :method) == :get
    assert Keyword.fetch!(first_read_request, :url) == workbook_document_url

    assert_receive {:firestore_request, second_read_request}
    assert Keyword.fetch!(second_read_request, :method) == :get
    assert Keyword.fetch!(second_read_request, :url) == chunks_url("user-1", "workbook-1")

    assert_receive {:firestore_request, chunk_request}
    assert Keyword.fetch!(chunk_request, :method) == :patch
    assert Keyword.fetch!(chunk_request, :url) == first_chunk_url

    assert get_in(Keyword.fetch!(chunk_request, :json), ["fields", "data"]) == %{
             "stringValue" => "AAA"
           }

    assert_receive {:firestore_request, workbook_request}
    assert Keyword.fetch!(workbook_request, :method) == :patch
    assert Keyword.fetch!(workbook_request, :url) == workbook_document_url

    assert get_in(Keyword.fetch!(workbook_request, :json), [
             "fields",
             "snapshotChunkCount"
           ]) == %{"integerValue" => "1"}

    assert get_in(Keyword.fetch!(workbook_request, :json), ["fields", "version"]) == %{
             "integerValue" => "4"
           }

    assert_receive {:firestore_request, delete_request}
    assert Keyword.fetch!(delete_request, :method) == :delete
    assert Keyword.fetch!(delete_request, :url) == stale_chunk_url
  end

  test "deletes workbook chunks before the parent workbook document" do
    put_request_responses(%{
      {:get, chunks_url("user-1", "workbook-1")} =>
        {:ok,
         response(200, %{
           "documents" => [
             chunk_name_document("users/user-1/workbooks/workbook-1/chunks/0000")
           ]
         })},
      {:delete, chunk_url("user-1", "workbook-1", 0)} => {:ok, response(200, %{})},
      {:delete, workbook_url("user-1", "workbook-1")} => {:ok, response(200, %{})}
    })

    assert :ok = Firestore.delete_workbook("user-1", "workbook-1")
  end

  test "returns errors for invalid payloads and invalid snapshot chunks" do
    assert {:error, :invalid_workbook_meta} =
             Firestore.write_workbook("user-1", %{}, "client-1")

    put_request_responses(%{
      {:get, workbook_url("user-1", "workbook-1")} => {:ok, response(200, valid_document())},
      {:get, chunks_url("user-1", "workbook-1")} =>
        {:ok, response(200, %{"documents" => [chunk_document(0, "AAA", "snapshot-3")]})}
    })

    assert {:error, :invalid_snapshot_chunks} =
             Firestore.read_workbook("user-1", "workbook-1")
  end

  test "propagates access token failures and normalizes firestore request failures" do
    Application.put_env(
      :papyrus_collab,
      AccessTokenProvider,
      adapter: FailingAccessTokenProviderStub
    )

    assert {:error, :token_unavailable} = Firestore.list_workbooks("user-1")
    assert {:error, :token_unavailable} = Firestore.read_workbook("user-1", "workbook-1")
    assert {:error, :token_unavailable} = Firestore.delete_workbook("user-1", "workbook-1")

    assert {:error, :token_unavailable} =
             Firestore.write_workbook("user-1", workbook_payload("AAA"), "client-1")

    Application.put_env(
      :papyrus_collab,
      AccessTokenProvider,
      adapter: AccessTokenProviderStub
    )

    put_request_responses(%{
      {:get, workbooks_url("user-2")} => {:error, :network_down},
      {:get, workbook_url("user-2", "workbook-404")} => {:ok, response(404, %{})},
      {:get, workbook_url("user-2", "workbook-error")} =>
        {:ok, response(500, %{"error" => "read_failed"})},
      {:get, chunks_url("user-2", "workbook-delete-error")} =>
        {:ok,
         response(200, %{
           "documents" => [
             chunk_name_document("users/user-2/workbooks/workbook-delete-error/chunks/0000")
           ]
         })},
      {:delete, chunk_url("user-2", "workbook-delete-error", 0)} => {:error, :chunk_delete_failed}
    })

    assert {:error, :network_down} = Firestore.list_workbooks("user-2")
    assert {:ok, nil} = Firestore.read_workbook("user-2", "workbook-404")

    assert {:error, {:firestore_http, 500, %{"error" => "read_failed"}}} =
             Firestore.read_workbook("user-2", "workbook-error")

    assert {:error, :chunk_delete_failed} =
             Firestore.delete_workbook("user-2", "workbook-delete-error")
  end

  test "handles empty chunk lists, invalid remote fields, and project id fallback" do
    previous_store_config = Application.get_env(:papyrus_collab, Firestore, [])

    previous_id_token_config =
      Application.get_env(:papyrus_collab, PapyrusCollab.Firebase.IdTokenVerifier, [])

    put_request_responses(%{
      {:get, workbooks_url("user-3")} =>
        {:ok, response(200, %{"documents" => [invalid_meta_document()]})},
      {:get, workbook_url("user-3", "workbook-empty")} =>
        {:ok, response(200, zero_chunk_document())},
      {:get, chunks_url("user-3", "workbook-empty")} => {:ok, response(200, %{})},
      {:get, workbook_url("user-3", "workbook-invalid-fields")} =>
        {:ok, response(200, invalid_document())},
      {:get, chunks_url("user-3", "workbook-invalid-fields")} => {:ok, response(200, %{})},
      {:get, chunks_url("user-3", "workbook-write-error")} => {:ok, response(200, %{})},
      {:get, workbook_url("user-3", "workbook-write-error")} => {:ok, response(200, %{})}
    })

    assert {:ok, workbook} = Firestore.read_workbook("user-3", "workbook-empty")
    assert workbook.updateBase64 == ""

    assert {:ok, []} = Firestore.list_workbooks("user-3")

    assert :error = Firestore.read_workbook("user-3", "workbook-invalid-fields")

    Application.put_env(
      :papyrus_collab,
      Firestore,
      requester: fn options ->
        send(self(), {:firestore_request, options})
        {:ok, response(404, %{})}
      end
    )

    Application.put_env(
      :papyrus_collab,
      PapyrusCollab.Firebase.IdTokenVerifier,
      project_id: "papyrus-fallback"
    )

    drain_firestore_requests()

    assert {:ok, nil} = Firestore.read_workbook("user-4", "workbook-1")

    assert_receive {:firestore_request, request}

    assert Keyword.fetch!(request, :url) ==
             "https://firestore.googleapis.com/v1/projects/papyrus-fallback/databases/(default)/documents/users/user-4/workbooks/workbook-1"

    Application.delete_env(:papyrus_collab, Firestore)
    Application.delete_env(:papyrus_collab, PapyrusCollab.Firebase.IdTokenVerifier)

    assert {:error, :missing_firebase_project_id} =
             Firestore.read_workbook("user-4", "workbook-1")

    Application.put_env(:papyrus_collab, Firestore, previous_store_config)

    Application.put_env(
      :papyrus_collab,
      PapyrusCollab.Firebase.IdTokenVerifier,
      previous_id_token_config
    )
  end

  test "writes null active sheet ids, handles missing prior snapshots, and treats missing deletes as success" do
    workbook_document_url = workbook_url("user-5", "workbook-1")

    put_request_responses(%{
      {:get, workbook_document_url} => :not_found,
      {:get, chunks_url("user-5", "workbook-1")} => :not_found,
      {:patch, chunk_url("user-5", "workbook-1", 0)} => {:ok, response(200, %{})},
      {:patch, workbook_document_url} => {:ok, response(200, %{})}
    })

    assert {:ok, %{version: 4}} =
             Firestore.write_workbook(
               "user-5",
               workbook_payload("AAA")
               |> Map.put("activeSheetId", nil),
               "client-1"
             )

    assert_receive {:firestore_request, _get_document_request}
    assert_receive {:firestore_request, _get_chunks_request}
    assert_receive {:firestore_request, _chunk_patch_request}
    assert_receive {:firestore_request, workbook_request}

    assert get_in(Keyword.fetch!(workbook_request, :json), ["fields", "activeSheetId"]) == %{
             "nullValue" => nil
           }

    put_request_responses(%{
      {:get, chunks_url("user-5", "workbook-missing")} => :not_found,
      {:delete, workbook_url("user-5", "workbook-missing")} => :not_found
    })

    assert :ok = Firestore.delete_workbook("user-5", "workbook-missing")
  end

  test "validates workbook payloads and alternate firestore encodings strictly" do
    workbook_document_url = workbook_url("user-6", "workbook-1")

    assert {:error, {:invalid_string, "activeSheetId"}} =
             Firestore.write_workbook(
               "user-6",
               workbook_payload("AAA")
               |> Map.put("activeSheetId", 123),
               "client-1"
             )

    assert {:error, {:invalid_boolean, "sharingEnabled"}} =
             Firestore.write_workbook(
               "user-6",
               workbook_payload("AAA")
               |> put_in(["meta", "sharingEnabled"], "yes"),
               "client-1"
             )

    assert {:error, {:invalid_integer, "version"}} =
             Firestore.write_workbook(
               "user-6",
               workbook_payload("AAA")
               |> Map.put("version", -1),
               "client-1"
             )

    assert {:error, {:invalid_string, "updateBase64"}} =
             Firestore.write_workbook(
               "user-6",
               workbook_payload("AAA")
               |> Map.put("updateBase64", 123),
               "client-1"
             )

    put_request_responses(%{
      {:get, workbook_document_url} => :not_found,
      {:get, chunks_url("user-6", "workbook-1")} => {:ok, response(200, %{})},
      {:patch, chunk_url("user-6", "workbook-1", 0)} => {:ok, response(200, %{})},
      {:patch, workbook_document_url} => {:ok, response(200, %{})}
    })

    assert {:ok, %{version: 4}} =
             Firestore.write_workbook(
               "user-6",
               workbook_payload("AAA")
               |> put_in(["meta", "lastSyncedAt"], 123)
               |> put_in(["meta", "remoteVersion"], "unexpected"),
               "client-1"
             )

    put_request_responses(%{
      {:get, workbook_document_url} => :not_found,
      {:get, chunks_url("user-6", "workbook-1")} => {:ok, response(200, %{})},
      {:patch, chunk_url("user-6", "workbook-1", 0)} => {:ok, response(200, %{})},
      {:patch, workbook_document_url} => {:ok, response(200, %{})}
    })

    assert {:ok, %{version: 4}} =
             Firestore.write_workbook(
               "user-6",
               workbook_payload("AAA")
               |> put_in(["meta", "lastSyncedAt"], "2026-03-13T02:00:00.000Z")
               |> put_in(["meta", "remoteVersion"], 9),
               "client-1"
             )
  end

  test "normalizes chunk write failures and alternate document field shapes" do
    put_request_responses(%{
      {:get, workbook_url("user-7", "workbook-1")} => :not_found,
      {:get, chunks_url("user-7", "workbook-1")} => {:ok, response(200, %{})},
      {:patch, chunk_url("user-7", "workbook-1", 0)} => {:error, :chunk_write_failed},
      {:get, workbook_url("user-7", "workbook-int-fields")} =>
        {:ok, response(200, integer_encoded_document())},
      {:get, chunks_url("user-7", "workbook-int-fields")} => {:ok, response(200, %{})},
      {:get, workbook_url("user-7", "workbook-missing-field")} =>
        {:ok, response(200, missing_optional_field_document())},
      {:get, chunks_url("user-7", "workbook-missing-field")} => {:ok, response(200, %{})},
      {:get, workbook_url("user-7", "workbook-invalid-field")} =>
        {:ok, response(200, invalid_chunk_field_document())},
      {:get, chunks_url("user-7", "workbook-invalid-field")} => {:ok, response(200, %{})},
      {:get, workbook_url("user-7", "workbook-invalid-integer")} =>
        {:ok, response(200, invalid_integer_document())},
      {:get, chunks_url("user-7", "workbook-invalid-integer")} => {:ok, response(200, %{})}
    })

    assert {:error, :chunk_write_failed} =
             Firestore.write_workbook("user-7", workbook_payload("AAA"), "client-1")

    assert {:ok, workbook} = Firestore.read_workbook("user-7", "workbook-int-fields")
    assert workbook.version == 3
    assert workbook.meta.remoteVersion == 3

    assert {:ok, workbook_without_active_sheet} =
             Firestore.read_workbook("user-7", "workbook-missing-field")

    assert workbook_without_active_sheet.activeSheetId == nil

    assert :error = Firestore.read_workbook("user-7", "workbook-invalid-field")
    assert :error = Firestore.read_workbook("user-7", "workbook-invalid-integer")
  end

  defp put_request_responses(responses) do
    Process.put(:firestore_request_responses, responses)
  end

  defp drain_firestore_requests do
    receive do
      {:firestore_request, _request} -> drain_firestore_requests()
    after
      0 -> :ok
    end
  end

  defp firestore_response(options) do
    method = Keyword.fetch!(options, :method)
    url = Keyword.fetch!(options, :url)

    Process.get(:firestore_request_responses, %{})
    |> Map.get({method, url}, {:error, {:unexpected_request, method, url}})
  end

  defp response(status, body) do
    %Req.Response{status: status, body: body}
  end

  defp string_value(value), do: %{"stringValue" => value}
  defp boolean_value(value), do: %{"booleanValue" => value}
  defp integer_value(value), do: %{"integerValue" => Integer.to_string(value)}

  defp valid_document do
    %{
      "fields" => %{
        "activeSheetId" => string_value("sheet-1"),
        "createdAt" => string_value("2026-03-13T00:00:00.000Z"),
        "id" => string_value("workbook-1"),
        "isFavorite" => boolean_value(false),
        "lastOpenedAt" => string_value("2026-03-13T01:00:00.000Z"),
        "lastSyncedAt" => string_value("2026-03-13T02:00:00.000Z"),
        "name" => string_value("Budget"),
        "remoteVersion" => integer_value(3),
        "sharingAccessRole" => string_value("viewer"),
        "sharingEnabled" => boolean_value(true),
        "snapshotChunkCount" => integer_value(2),
        "snapshotId" => string_value("snapshot-3"),
        "updatedAt" => string_value("2026-03-13T01:00:00.000Z"),
        "version" => integer_value(3)
      },
      "name" =>
        "projects/papyrus-test/databases/(default)/documents/users/user-1/workbooks/workbook-1"
    }
  end

  defp invalid_document do
    %{
      "fields" => %{
        "activeSheetId" => %{"booleanValue" => true},
        "createdAt" => string_value("2026-03-13T00:00:00.000Z"),
        "id" => string_value("workbook-invalid-fields"),
        "isFavorite" => boolean_value(false),
        "lastOpenedAt" => string_value("2026-03-13T01:00:00.000Z"),
        "lastSyncedAt" => string_value("2026-03-13T02:00:00.000Z"),
        "name" => string_value("Budget"),
        "remoteVersion" => %{"stringValue" => "bad"},
        "sharingAccessRole" => string_value("viewer"),
        "sharingEnabled" => boolean_value(true),
        "snapshotChunkCount" => integer_value(0),
        "snapshotId" => string_value("snapshot-3"),
        "updatedAt" => string_value("2026-03-13T01:00:00.000Z"),
        "version" => %{"stringValue" => "bad"}
      },
      "name" =>
        "projects/papyrus-test/databases/(default)/documents/users/user-3/workbooks/workbook-invalid-fields"
    }
  end

  defp zero_chunk_document do
    valid_document()
    |> put_in(["fields", "snapshotChunkCount"], integer_value(0))
  end

  defp invalid_meta_document do
    valid_document()
    |> put_in(["fields", "isFavorite"], %{"stringValue" => "bad"})
  end

  defp integer_encoded_document do
    valid_document()
    |> put_in(["fields", "remoteVersion"], %{"integerValue" => 3})
    |> put_in(["fields", "version"], %{"integerValue" => 3})
    |> put_in(["fields", "snapshotChunkCount"], integer_value(0))
  end

  defp missing_optional_field_document do
    valid_document()
    |> update_in(["fields"], &Map.delete(&1, "activeSheetId"))
    |> put_in(["fields", "snapshotChunkCount"], integer_value(0))
  end

  defp invalid_chunk_field_document do
    valid_document()
    |> put_in(["fields", "snapshotChunkCount"], integer_value(0))
    |> put_in(["fields", "snapshotId"], %{"booleanValue" => true})
  end

  defp invalid_integer_document do
    valid_document()
    |> put_in(["fields", "version"], %{"integerValue" => "three"})
    |> put_in(["fields", "snapshotChunkCount"], integer_value(0))
  end

  defp chunk_document(index, data, snapshot_id) do
    %{
      "fields" => %{
        "data" => string_value(data),
        "index" => integer_value(index),
        "snapshotId" => string_value(snapshot_id)
      }
    }
  end

  defp chunk_name_document(path) do
    %{
      "name" => "projects/papyrus-test/databases/(default)/documents/#{path}"
    }
  end

  defp workbook_payload(update_base64) do
    %{
      "activeSheetId" => "sheet-1",
      "meta" => %{
        "createdAt" => "2026-03-13T00:00:00.000Z",
        "id" => "workbook-1",
        "isFavorite" => false,
        "lastOpenedAt" => "2026-03-13T01:00:00.000Z",
        "lastSyncedAt" => nil,
        "name" => "Budget",
        "remoteVersion" => nil,
        "sharingAccessRole" => "viewer",
        "sharingEnabled" => true,
        "updatedAt" => "2026-03-13T01:00:00.000Z"
      },
      "updateBase64" => update_base64,
      "version" => 3
    }
  end

  defp workbooks_url(user_id) do
    "https://firestore.googleapis.com/v1/projects/papyrus-test/databases/(default)/documents/users/#{user_id}/workbooks?pageSize=1000"
  end

  defp workbook_url(user_id, workbook_id) do
    "https://firestore.googleapis.com/v1/projects/papyrus-test/databases/(default)/documents/users/#{user_id}/workbooks/#{workbook_id}"
  end

  defp chunks_url(user_id, workbook_id) do
    workbook_url(user_id, workbook_id) <> "/chunks?pageSize=1000"
  end

  defp chunk_url(user_id, workbook_id, index) do
    workbook_url(user_id, workbook_id) <>
      "/chunks/" <>
      (index |> Integer.to_string() |> String.pad_leading(4, "0"))
  end
end
