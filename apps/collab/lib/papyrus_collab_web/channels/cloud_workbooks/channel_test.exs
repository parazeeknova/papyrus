defmodule PapyrusCollabWeb.CloudWorkbookChannelTest do
  use PapyrusCollabWeb.ChannelCase, async: false

  alias PapyrusCollab.Auth.Identity
  alias PapyrusCollab.CloudWorkbooks.Store
  alias PapyrusCollabWeb.{CloudWorkbookChannel, UserSocket}

  defmodule ErrorStoreStub do
    @behaviour Store

    @impl true
    def delete_workbook(_user_id, _workbook_id), do: {:error, {:firestore_http, 503, %{}}}

    @impl true
    def list_workbooks(_user_id), do: {:error, :enoent}

    @impl true
    def read_workbook(_user_id, _workbook_id), do: {:error, "remote_down"}

    @impl true
    def write_workbook(_user_id, _workbook, _client_id),
      do: {:error, {:missing_service_account_field, "private_key"}}
  end

  test "list, read, write, and delete stay scoped to the authenticated user" do
    workbook_id = unique_workbook_id()

    assert {:ok, socket} =
             connect(UserSocket, socket_params("user-1", "device-a", "user-1@example.com"))

    assert {:ok, _reply, socket} =
             subscribe_and_join(socket, CloudWorkbookChannel, "cloud_workbooks")

    list_ref = push(socket, "list", %{})
    assert_reply list_ref, :ok, %{workbooks: []}

    write_ref =
      push(socket, "write", %{
        "clientId" => "client-a",
        "workbook" => workbook_payload(workbook_id)
      })

    assert_reply write_ref, :ok, %{lastSyncedAt: last_synced_at, version: 1}
    assert is_binary(last_synced_at)

    read_ref = push(socket, "read", %{"workbookId" => workbook_id})

    assert_reply read_ref, :ok, %{
      workbook: %{
        "activeSheetId" => "sheet-1",
        "meta" => %{"id" => ^workbook_id, "remoteVersion" => 1},
        "updateBase64" => "AQID",
        "version" => 1
      }
    }

    list_ref = push(socket, "list", %{})

    assert_reply list_ref, :ok, %{
      workbooks: [
        %{
          "id" => ^workbook_id,
          "remoteVersion" => 1
        }
      ]
    }

    delete_ref = push(socket, "delete", %{"workbookId" => workbook_id})
    assert_reply delete_ref, :ok, %{deleted: true}

    read_ref = push(socket, "read", %{"workbookId" => workbook_id})
    assert_reply read_ref, :ok, %{workbook: nil}
  end

  test "leases stay with the current client until they expire or are released" do
    workbook_id = unique_workbook_id()

    assert {:ok, socket} =
             connect(UserSocket, socket_params("user-1", "device-a", "user-1@example.com"))

    assert {:ok, _reply, socket} =
             subscribe_and_join(socket, CloudWorkbookChannel, "cloud_workbooks")

    lease_ref =
      push(socket, "acquire_lease", %{
        "clientId" => "client-a",
        "workbookId" => workbook_id
      })

    assert_reply lease_ref, :ok, %{hasLease: true}

    lease_ref =
      push(socket, "acquire_lease", %{
        "clientId" => "client-b",
        "workbookId" => workbook_id
      })

    assert_reply lease_ref, :ok, %{hasLease: false}

    delete_ref = push(socket, "delete", %{"workbookId" => workbook_id})
    assert_reply delete_ref, :ok, %{deleted: true}

    lease_ref =
      push(socket, "acquire_lease", %{
        "clientId" => "client-b",
        "workbookId" => workbook_id
      })

    assert_reply lease_ref, :ok, %{hasLease: true}
  end

  test "one user cannot read another user's workbook namespace" do
    workbook_id = unique_workbook_id()

    assert {:ok, owner_socket} =
             connect(UserSocket, socket_params("owner", "device-a", "owner@example.com"))

    assert {:ok, _reply, owner_socket} =
             subscribe_and_join(owner_socket, CloudWorkbookChannel, "cloud_workbooks")

    write_ref =
      push(owner_socket, "write", %{
        "clientId" => "client-owner",
        "workbook" => workbook_payload(workbook_id)
      })

    assert_reply write_ref, :ok, %{version: 1}

    assert {:ok, other_socket} =
             connect(UserSocket, socket_params("other", "device-b", "other@example.com"))

    assert {:ok, _reply, other_socket} =
             subscribe_and_join(other_socket, CloudWorkbookChannel, "cloud_workbooks")

    read_ref = push(other_socket, "read", %{"workbookId" => workbook_id})
    assert_reply read_ref, :ok, %{workbook: nil}
  end

  test "normalizes direct error replies and unsupported events" do
    previous_store_config = Application.get_env(:papyrus_collab, Store)

    Application.put_env(:papyrus_collab, Store, adapter: ErrorStoreStub)

    on_exit(fn ->
      restore_env(:papyrus_collab, Store, previous_store_config)
    end)

    socket = %Phoenix.Socket{
      assigns: %{
        identity: %Identity{
          device_id: "device-unit",
          email: "unit@example.com",
          user_id: "user-unit"
        }
      }
    }

    assert {:reply, {:error, %{reason: "invalid_lease_request"}}, ^socket} =
             CloudWorkbookChannel.handle_in(
               "acquire_lease",
               %{"clientId" => "", "workbookId" => "workbook-unit"},
               socket
             )

    assert {:reply, {:error, %{reason: "invalid_workbook_id"}}, ^socket} =
             CloudWorkbookChannel.handle_in("delete", %{"workbookId" => ""}, socket)

    assert {:reply, {:error, %{reason: "enoent"}}, ^socket} =
             CloudWorkbookChannel.handle_in("list", %{}, socket)

    assert {:reply, {:error, %{reason: "remote_down"}}, ^socket} =
             CloudWorkbookChannel.handle_in("read", %{"workbookId" => "workbook-unit"}, socket)

    assert {:reply, {:error, %{reason: "missing_service_account_field_private_key"}}, ^socket} =
             CloudWorkbookChannel.handle_in(
               "write",
               %{"clientId" => "client-unit", "workbook" => workbook_payload("workbook-unit")},
               socket
             )

    assert {:reply, {:error, %{reason: "unsupported_event"}}, ^socket} =
             CloudWorkbookChannel.handle_in("unsupported", %{}, socket)
  end

  defp workbook_payload(workbook_id) do
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
        "sharingAccessRole" => "viewer",
        "sharingEnabled" => false,
        "updatedAt" => "2026-03-13T00:00:00.000Z"
      },
      "updateBase64" => "AQID",
      "version" => 0
    }
  end

  defp restore_env(app, key, nil), do: Application.delete_env(app, key)
  defp restore_env(app, key, value), do: Application.put_env(app, key, value)
end
