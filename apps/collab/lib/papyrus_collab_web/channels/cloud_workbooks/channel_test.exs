defmodule PapyrusCollabWeb.CloudWorkbookChannelTest do
  use PapyrusCollabWeb.ChannelCase, async: false

  alias PapyrusCollabWeb.{CloudWorkbookChannel, UserSocket}

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
end
