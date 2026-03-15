defmodule PapyrusCollab.CloudWorkbooksTest do
  use ExUnit.Case, async: false

  alias PapyrusCollab.Auth.Identity
  alias PapyrusCollab.{CloudWorkbooks, SharedWorkbooks}

  setup do
    :ok = CloudWorkbooks.reset()
    :ok
  end

  test "writes, reads, lists, and deletes owner workbooks while syncing the share registry" do
    identity = identity("owner-1", "device-1", "owner@example.com")
    workbook = workbook_payload("workbook-1")

    assert {:ok, %{version: 1}} = CloudWorkbooks.write_workbook(identity, workbook, "client-1")
    assert {:ok, [meta]} = CloudWorkbooks.list_workbooks(identity)
    assert meta["id"] == "workbook-1"

    assert {:ok, stored_workbook} = CloudWorkbooks.read_workbook(identity, "workbook-1")
    assert stored_workbook["meta"]["remoteVersion"] == 1

    assert {:ok, shared_workbook} = SharedWorkbooks.read_workbook("workbook-1")
    assert shared_workbook.ownerId == "owner-1"

    assert {:ok, owner_copy} = CloudWorkbooks.read_workbook_as_owner("owner-1", "workbook-1")
    assert owner_copy["meta"]["id"] == "workbook-1"

    assert :ok = CloudWorkbooks.delete_workbook(identity, "workbook-1")
    assert {:ok, nil} = CloudWorkbooks.read_workbook(identity, "workbook-1")
    assert {:ok, nil} = SharedWorkbooks.read_workbook("workbook-1")
  end

  test "validates wrapper inputs and supports owner-side writes" do
    identity = identity("owner-2", "device-2", "owner2@example.com")

    assert {:ok, true} = CloudWorkbooks.acquire_lease(identity, "workbook-2", "client-a")
    assert {:ok, false} = CloudWorkbooks.acquire_lease(identity, "workbook-2", "client-b")

    assert {:error, :invalid_lease_request} =
             CloudWorkbooks.acquire_lease(identity, "", "client-a")

    assert {:error, :invalid_workbook_id} = CloudWorkbooks.delete_workbook(identity, "")
    assert {:error, :invalid_workbook_id} = CloudWorkbooks.read_workbook(identity, "")

    assert {:error, :invalid_workbook_id} =
             CloudWorkbooks.read_workbook_as_owner("", "workbook-2")

    assert {:error, :invalid_workbook_payload} =
             CloudWorkbooks.write_workbook(identity, %{}, "")

    assert {:error, :invalid_workbook_payload} =
             CloudWorkbooks.write_workbook_as_owner("", %{}, "client-a")

    assert {:ok, %{version: 1}} =
             CloudWorkbooks.write_workbook_as_owner(
               "owner-2",
               workbook_payload("workbook-2"),
               "client-owner"
             )

    assert {:ok, owner_copy} = CloudWorkbooks.read_workbook_as_owner("owner-2", "workbook-2")
    assert owner_copy["meta"]["id"] == "workbook-2"
  end

  defp identity(user_id, device_id, email) do
    %Identity{device_id: device_id, email: email, user_id: user_id}
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
        "sharingEnabled" => true,
        "updatedAt" => "2026-03-13T00:00:00.000Z"
      },
      "updateBase64" => "AQID",
      "version" => 0
    }
  end
end
