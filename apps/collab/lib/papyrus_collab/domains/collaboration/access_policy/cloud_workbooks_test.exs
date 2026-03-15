defmodule PapyrusCollab.Collaboration.AccessPolicy.CloudWorkbooksTest do
  use ExUnit.Case, async: false

  alias PapyrusCollab.Auth.Identity
  alias PapyrusCollab.CloudWorkbooks
  alias PapyrusCollab.CloudWorkbooks.Store
  alias PapyrusCollab.Collaboration.AccessPolicy.CloudWorkbooks, as: CloudWorkbookAccessPolicy
  alias PapyrusCollab.SharedWorkbooks.Store, as: SharedWorkbookStore

  defmodule CloudWorkbookStoreStub do
    @behaviour Store

    @impl true
    def delete_workbook(_user_id, _workbook_id), do: :ok

    @impl true
    def list_workbooks(_user_id), do: {:ok, []}

    @impl true
    def read_workbook(user_id, workbook_id) do
      Application.get_env(:papyrus_collab, __MODULE__, [])
      |> Keyword.get(:responses, %{})
      |> Map.get({user_id, workbook_id}, {:ok, nil})
    end

    @impl true
    def write_workbook(_user_id, _workbook, _client_id), do: {:ok, %{version: 1}}

    @spec reset() :: :ok
    def reset, do: :ok
  end

  defmodule SharedWorkbookStoreStub do
    @behaviour SharedWorkbookStore

    @impl true
    def delete_workbook(_workbook_id), do: :ok

    @impl true
    def read_workbook(workbook_id) do
      Application.get_env(:papyrus_collab, __MODULE__, [])
      |> Keyword.get(:responses, %{})
      |> Map.get(workbook_id, {:ok, nil})
    end

    @impl true
    def reset, do: :ok

    @impl true
    def sync_workbook(_owner_id, _workbook), do: :ok
  end

  setup do
    previous_cloud_store = Application.get_env(:papyrus_collab, Store)
    previous_shared_store = Application.get_env(:papyrus_collab, SharedWorkbookStore)
    previous_cloud_stub = Application.get_env(:papyrus_collab, CloudWorkbookStoreStub)
    previous_shared_stub = Application.get_env(:papyrus_collab, SharedWorkbookStoreStub)

    CloudWorkbooks.reset()

    on_exit(fn ->
      restore_env(:papyrus_collab, Store, previous_cloud_store)
      restore_env(:papyrus_collab, SharedWorkbookStore, previous_shared_store)
      restore_env(:papyrus_collab, CloudWorkbookStoreStub, previous_cloud_stub)
      restore_env(:papyrus_collab, SharedWorkbookStoreStub, previous_shared_stub)
    end)

    :ok
  end

  test "owners receive editor access for their own workbook" do
    owner_identity = identity("owner-1", "device-owner", "owner@example.com")
    workbook_id = unique_workbook_id()

    assert {:ok, _write_result} =
             CloudWorkbooks.write_workbook(
               owner_identity,
               workbook_payload(workbook_id, "viewer", false),
               "seed-client"
             )

    assert {:ok, %{access_role: "editor", owner_id: "owner-1", workbook: workbook}} =
             CloudWorkbookAccessPolicy.authorize_workbook(owner_identity, workbook_id)

    assert workbook["meta"]["id"] == workbook_id
  end

  test "shared users inherit viewer or editor access from the backend share record" do
    owner_identity = identity("owner-2", "device-owner", "owner-2@example.com")
    shared_identity = identity("editor-2", "device-shared", "editor-2@example.com")
    workbook_id = unique_workbook_id()

    assert {:ok, _write_result} =
             CloudWorkbooks.write_workbook(
               owner_identity,
               workbook_payload(workbook_id, "editor", true),
               "seed-client"
             )

    assert {:ok, %{access_role: "editor", owner_id: "owner-2", workbook: workbook}} =
             CloudWorkbookAccessPolicy.authorize_workbook(shared_identity, workbook_id)

    assert workbook["meta"]["id"] == workbook_id
  end

  test "shared access is rejected when the owner disables sharing" do
    owner_identity = identity("owner-3", "device-owner", "owner-3@example.com")
    shared_identity = identity("viewer-3", "device-shared", "viewer-3@example.com")
    workbook_id = unique_workbook_id()

    assert {:ok, _write_result} =
             CloudWorkbooks.write_workbook(
               owner_identity,
               workbook_payload(workbook_id, "viewer", true),
               "seed-client"
             )

    assert {:ok, _write_result} =
             CloudWorkbooks.write_workbook(
               owner_identity,
               workbook_payload(workbook_id, "viewer", false),
               "seed-client"
             )

    assert {:error, :forbidden} =
             CloudWorkbookAccessPolicy.authorize_workbook(shared_identity, workbook_id)
  end

  test "shared access is rejected when the requester is the owner or the owner workbook is missing" do
    owner_identity = identity("owner-4", "device-owner", "owner-4@example.com")
    workbook_id = unique_workbook_id()

    assert :ok =
             PapyrusCollab.SharedWorkbooks.sync_workbook("owner-4", %{
               "meta" => %{
                 "id" => workbook_id,
                 "sharingAccessRole" => "viewer",
                 "sharingEnabled" => true
               }
             })

    assert {:error, :forbidden} =
             CloudWorkbookAccessPolicy.authorize_workbook(owner_identity, workbook_id)

    missing_owner_identity = identity("shared-4", "device-shared", "shared-4@example.com")

    assert :ok =
             PapyrusCollab.SharedWorkbooks.sync_workbook("missing-owner", %{
               "meta" => %{
                 "id" => workbook_id <> "-missing",
                 "sharingAccessRole" => "viewer",
                 "sharingEnabled" => true
               }
             })

    assert {:error, :forbidden} =
             CloudWorkbookAccessPolicy.authorize_workbook(
               missing_owner_identity,
               workbook_id <> "-missing"
             )
  end

  test "surfaces owner store errors and fails closed on malformed shared records" do
    Application.put_env(:papyrus_collab, Store, adapter: CloudWorkbookStoreStub)
    Application.put_env(:papyrus_collab, SharedWorkbookStore, adapter: SharedWorkbookStoreStub)

    Application.put_env(
      :papyrus_collab,
      CloudWorkbookStoreStub,
      responses: %{
        {"owner-error", "workbook-owner-error"} => {:error, :storage_unavailable},
        {"shared-user", "workbook-shared-error"} => {:ok, nil},
        {"owner-backend", "workbook-shared-error"} => {:error, :owner_store_down},
        {"shared-user", "workbook-malformed"} => {:ok, nil},
        {"shared-user", "workbook-sharing-disabled"} => {:ok, nil},
        {"shared-user", "workbook-self-owner"} => {:ok, nil}
      }
    )

    Application.put_env(
      :papyrus_collab,
      SharedWorkbookStoreStub,
      responses: %{
        "workbook-shared-error" =>
          {:ok,
           %{
             accessRole: "viewer",
             ownerId: "owner-backend",
             sharingEnabled: true,
             workbookId: "workbook-shared-error"
           }},
        "workbook-malformed" =>
          {:ok,
           %{
             accessRole: "owner",
             ownerId: "owner-malformed",
             sharingEnabled: true,
             workbookId: "workbook-malformed"
           }},
        "workbook-sharing-disabled" =>
          {:ok,
           %{
             accessRole: "viewer",
             ownerId: "owner-disabled",
             sharingEnabled: false,
             workbookId: "workbook-sharing-disabled"
           }},
        "workbook-self-owner" =>
          {:ok,
           %{
             accessRole: "viewer",
             ownerId: "shared-user",
             sharingEnabled: true,
             workbookId: "workbook-self-owner"
           }}
      }
    )

    assert {:error, :storage_unavailable} =
             CloudWorkbookAccessPolicy.authorize_workbook(
               identity("owner-error", "device-owner", "owner@example.com"),
               "workbook-owner-error"
             )

    assert {:error, :owner_store_down} =
             CloudWorkbookAccessPolicy.authorize_workbook(
               identity("shared-user", "device-shared", "shared@example.com"),
               "workbook-shared-error"
             )

    assert {:error, :forbidden} =
             CloudWorkbookAccessPolicy.authorize_workbook(
               identity("shared-user", "device-shared", "shared@example.com"),
               "workbook-malformed"
             )

    assert {:error, :forbidden} =
             CloudWorkbookAccessPolicy.authorize_workbook(
               identity("shared-user", "device-shared", "shared@example.com"),
               "workbook-sharing-disabled"
             )

    assert {:error, :forbidden} =
             CloudWorkbookAccessPolicy.authorize_workbook(
               identity("shared-user", "device-shared", "shared@example.com"),
               "workbook-self-owner"
             )
  end

  test "fails closed when backend stores return unexpected falsey or malformed responses" do
    Application.put_env(:papyrus_collab, Store, adapter: CloudWorkbookStoreStub)
    Application.put_env(:papyrus_collab, SharedWorkbookStore, adapter: SharedWorkbookStoreStub)

    Application.put_env(
      :papyrus_collab,
      CloudWorkbookStoreStub,
      responses: %{
        {"shared-user", "workbook-owner-false"} => {:ok, nil},
        {"owner-false", "workbook-owner-false"} => false,
        {"shared-user", "workbook-shared-weird"} => {:ok, nil}
      }
    )

    Application.put_env(
      :papyrus_collab,
      SharedWorkbookStoreStub,
      responses: %{
        "workbook-owner-false" =>
          {:ok,
           %{
             accessRole: "viewer",
             ownerId: "owner-false",
             sharingEnabled: true,
             workbookId: "workbook-owner-false"
           }},
        "workbook-shared-weird" => false
      }
    )

    assert {:error, :forbidden} =
             CloudWorkbookAccessPolicy.authorize_workbook(
               identity("shared-user", "device-shared", "shared@example.com"),
               "workbook-owner-false"
             )

    assert {:error, :forbidden} =
             CloudWorkbookAccessPolicy.authorize_workbook(
               identity("shared-user", "device-shared", "shared@example.com"),
               "workbook-shared-weird"
             )
  end

  test "fails closed when the shared workbook backend returns an unexpected tuple" do
    Application.put_env(:papyrus_collab, Store, adapter: CloudWorkbookStoreStub)
    Application.put_env(:papyrus_collab, SharedWorkbookStore, adapter: SharedWorkbookStoreStub)

    Application.put_env(
      :papyrus_collab,
      CloudWorkbookStoreStub,
      responses: %{{"shared-user", "workbook-shared-tuple"} => {:ok, nil}}
    )

    Application.put_env(
      :papyrus_collab,
      SharedWorkbookStoreStub,
      responses: %{"workbook-shared-tuple" => {:ok, :unexpected}}
    )

    assert {:error, :forbidden} =
             CloudWorkbookAccessPolicy.authorize_workbook(
               identity("shared-user", "device-shared", "shared@example.com"),
               "workbook-shared-tuple"
             )
  end

  defp identity(user_id, device_id, email) do
    %Identity{
      device_id: device_id,
      email: email,
      user_id: user_id
    }
  end

  defp unique_workbook_id do
    "workbook-" <> Integer.to_string(System.unique_integer([:positive]))
  end

  defp workbook_payload(workbook_id, sharing_access_role, sharing_enabled) do
    %{
      "activeSheetId" => "sheet-1",
      "meta" => %{
        "createdAt" => "2026-03-13T00:00:00.000Z",
        "id" => workbook_id,
        "isFavorite" => false,
        "lastOpenedAt" => "2026-03-13T00:00:00.000Z",
        "lastSyncedAt" => nil,
        "name" => "Budget",
        "remoteVersion" => nil,
        "sharingAccessRole" => sharing_access_role,
        "sharingEnabled" => sharing_enabled,
        "updatedAt" => "2026-03-13T00:00:00.000Z"
      },
      "updateBase64" => "AQID",
      "version" => 0
    }
  end

  defp restore_env(app, key, nil), do: Application.delete_env(app, key)
  defp restore_env(app, key, value), do: Application.put_env(app, key, value)
end
