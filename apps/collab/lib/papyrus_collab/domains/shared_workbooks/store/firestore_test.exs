defmodule PapyrusCollab.SharedWorkbooks.Store.FirestoreTest do
  use ExUnit.Case, async: false

  alias PapyrusCollab.Platform.Google.AccessTokenProvider
  alias PapyrusCollab.SharedWorkbooks.Store.Firestore

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
        send(test_pid, {:shared_workbook_request, options})
        shared_workbook_response(options)
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

  test "reads shared workbook access and returns nil for missing documents" do
    put_request_responses(%{
      {:get, shared_workbook_url("workbook-1")} =>
        {:ok,
         response(200, %{
           "fields" => %{
             "accessRole" => %{"stringValue" => "viewer"},
             "ownerId" => %{"stringValue" => "owner-1"},
             "sharingEnabled" => %{"booleanValue" => true},
             "workbookId" => %{"stringValue" => "workbook-1"}
           },
           "name" =>
             "projects/papyrus-test/databases/(default)/documents/sharedWorkbooks/workbook-1"
         })}
    })

    assert {:ok,
            %{
              accessRole: "viewer",
              ownerId: "owner-1",
              sharingEnabled: true,
              workbookId: "workbook-1"
            }} = Firestore.read_workbook("workbook-1")

    put_request_responses(%{
      {:get, shared_workbook_url("missing-workbook")} => :not_found
    })

    assert {:ok, nil} = Firestore.read_workbook("missing-workbook")
  end

  test "syncs enabled shared workbooks and deletes disabled ones" do
    put_request_responses(%{
      {:patch, shared_workbook_url("workbook-1")} => {:ok, response(200, %{})}
    })

    assert :ok =
             Firestore.sync_workbook("owner-1", %{
               "meta" => %{
                 "id" => "workbook-1",
                 "sharingAccessRole" => "editor",
                 "sharingEnabled" => true
               }
             })

    put_request_responses(%{
      {:delete, shared_workbook_url("workbook-1")} => {:ok, response(200, %{})}
    })

    assert :ok =
             Firestore.sync_workbook("owner-1", %{
               "meta" => %{
                 "id" => "workbook-1",
                 "sharingAccessRole" => "viewer",
                 "sharingEnabled" => false
               }
             })
  end

  test "returns errors for invalid payloads and malformed shared workbook documents" do
    assert {:error, :invalid_workbook_payload} =
             Firestore.sync_workbook("owner-1", %{"meta" => %{}})

    assert {:error, :invalid_workbook_payload} =
             Firestore.sync_workbook("owner-1", %{"workbook" => %{}})

    put_request_responses(%{
      {:get, shared_workbook_url("workbook-1")} =>
        {:ok,
         response(200, %{
           "name" =>
             "projects/papyrus-test/databases/(default)/documents/sharedWorkbooks/workbook-1"
         })}
    })

    assert {:error, :invalid_shared_workbook} = Firestore.read_workbook("workbook-1")

    put_request_responses(%{
      {:get, shared_workbook_url("workbook-2")} =>
        {:ok,
         response(200, %{
           "fields" => %{
             "accessRole" => %{"booleanValue" => true},
             "ownerId" => %{"stringValue" => "owner-1"},
             "sharingEnabled" => %{"stringValue" => "yes"},
             "workbookId" => %{"stringValue" => "workbook-2"}
           },
           "name" =>
             "projects/papyrus-test/databases/(default)/documents/sharedWorkbooks/workbook-2"
         })}
    })

    assert {:error, :invalid_shared_workbook} = Firestore.read_workbook("workbook-2")

    put_request_responses(%{
      {:get, shared_workbook_url("workbook-3")} =>
        {:ok,
         response(200, %{
           "fields" => %{
             "accessRole" => %{"stringValue" => "viewer"},
             "ownerId" => %{"stringValue" => "owner-1"},
             "sharingEnabled" => %{"stringValue" => "yes"},
             "workbookId" => %{"stringValue" => "workbook-3"}
           },
           "name" =>
             "projects/papyrus-test/databases/(default)/documents/sharedWorkbooks/workbook-3"
         })}
    })

    assert {:error, :invalid_shared_workbook} = Firestore.read_workbook("workbook-3")
  end

  test "treats missing deletes as success" do
    put_request_responses(%{
      {:delete, shared_workbook_url("missing-workbook")} => :not_found
    })

    assert :ok = Firestore.delete_workbook("missing-workbook")
    assert :ok = Firestore.reset()
  end

  test "propagates access token failures and request errors" do
    Application.put_env(
      :papyrus_collab,
      AccessTokenProvider,
      adapter: FailingAccessTokenProviderStub
    )

    assert {:error, :token_unavailable} = Firestore.read_workbook("workbook-1")
    assert {:error, :token_unavailable} = Firestore.delete_workbook("workbook-1")

    assert {:error, :token_unavailable} =
             Firestore.sync_workbook("owner-1", %{
               "meta" => %{
                 "id" => "workbook-1",
                 "sharingAccessRole" => "viewer",
                 "sharingEnabled" => true
               }
             })

    Application.put_env(
      :papyrus_collab,
      AccessTokenProvider,
      adapter: AccessTokenProviderStub
    )

    put_request_responses(%{
      {:get, shared_workbook_url("workbook-1")} => {:error, :network_down},
      {:delete, shared_workbook_url("workbook-2")} => {:error, :network_down},
      {:patch, shared_workbook_url("workbook-3")} =>
        {:ok, response(500, %{"error" => "write_failed"})},
      {:get, shared_workbook_url("workbook-4")} =>
        {:ok, response(500, %{"error" => "read_failed"})},
      {:delete, shared_workbook_url("workbook-5")} => {:ok, response(404, %{})}
    })

    assert {:error, :network_down} = Firestore.read_workbook("workbook-1")
    assert {:error, :network_down} = Firestore.delete_workbook("workbook-2")

    assert {:error, {:firestore_http, 500, %{"error" => "write_failed"}}} =
             Firestore.sync_workbook("owner-1", %{
               "meta" => %{
                 "id" => "workbook-3",
                 "sharingAccessRole" => "viewer",
                 "sharingEnabled" => true
               }
             })

    assert {:error, {:firestore_http, 500, %{"error" => "read_failed"}}} =
             Firestore.read_workbook("workbook-4")

    assert :ok = Firestore.delete_workbook("workbook-5")
  end

  test "uses the firebase project id fallback and raises when no project id is configured" do
    previous_store_config = Application.get_env(:papyrus_collab, Firestore, [])

    previous_id_token_config =
      Application.get_env(:papyrus_collab, PapyrusCollab.Firebase.IdTokenVerifier, [])

    Application.put_env(
      :papyrus_collab,
      Firestore,
      requester: fn options ->
        send(self(), {:shared_workbook_request, options})
        {:ok, response(404, %{})}
      end
    )

    Application.put_env(
      :papyrus_collab,
      PapyrusCollab.Firebase.IdTokenVerifier,
      project_id: "papyrus-fallback"
    )

    assert {:ok, nil} = Firestore.read_workbook("workbook-1")

    assert_receive {:shared_workbook_request, request}

    assert Keyword.fetch!(request, :url) ==
             "https://firestore.googleapis.com/v1/projects/papyrus-fallback/databases/(default)/documents/sharedWorkbooks/workbook-1"

    Application.delete_env(:papyrus_collab, Firestore)
    Application.delete_env(:papyrus_collab, PapyrusCollab.Firebase.IdTokenVerifier)

    assert_raise ArgumentError, ~r/FIREBASE_PROJECT_ID is required/, fn ->
      Firestore.read_workbook("workbook-1")
    end

    Application.put_env(:papyrus_collab, Firestore, previous_store_config)

    Application.put_env(
      :papyrus_collab,
      PapyrusCollab.Firebase.IdTokenVerifier,
      previous_id_token_config
    )
  end

  defp put_request_responses(responses) do
    Process.put(:shared_workbook_request_responses, responses)
  end

  defp shared_workbook_response(options) do
    method = Keyword.fetch!(options, :method)
    url = Keyword.fetch!(options, :url)

    Process.get(:shared_workbook_request_responses, %{})
    |> Map.get({method, url}, {:error, {:unexpected_request, method, url}})
  end

  defp response(status, body) do
    %Req.Response{status: status, body: body}
  end

  defp shared_workbook_url(workbook_id) do
    "https://firestore.googleapis.com/v1/projects/papyrus-test/databases/(default)/documents/sharedWorkbooks/#{workbook_id}"
  end
end
