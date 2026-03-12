defmodule PapyrusCollab.Collaboration.AccessPolicy.CloudWorkbooksTest do
  use ExUnit.Case, async: false

  alias PapyrusCollab.Auth.Identity
  alias PapyrusCollab.CloudWorkbooks
  alias PapyrusCollab.Collaboration.AccessPolicy.CloudWorkbooks, as: CloudWorkbookAccessPolicy

  setup do
    CloudWorkbooks.reset()
    :ok
  end

  test "owners receive editor access for their own workbook" do
    owner_identity = identity("owner-1", "device-owner", "owner@example.com")
    workbook_id = unique_workbook_id()

    assert {:ok, _write_result} =
             CloudWorkbooks.write_workbook(
               owner_identity,
               "firebase-token",
               workbook_payload(workbook_id, "viewer", false),
               "seed-client"
             )

    assert {:ok, %{access_role: "editor", owner_id: "owner-1", workbook: workbook}} =
             CloudWorkbookAccessPolicy.authorize_workbook(
               owner_identity,
               "firebase-token",
               workbook_id
             )

    assert workbook["meta"]["id"] == workbook_id
  end

  test "shared users inherit viewer or editor access from the backend share record" do
    owner_identity = identity("owner-2", "device-owner", "owner-2@example.com")
    shared_identity = identity("editor-2", "device-shared", "editor-2@example.com")
    workbook_id = unique_workbook_id()

    assert {:ok, _write_result} =
             CloudWorkbooks.write_workbook(
               owner_identity,
               "firebase-token",
               workbook_payload(workbook_id, "editor", true),
               "seed-client"
             )

    assert {:ok, %{access_role: "editor", owner_id: "owner-2", workbook: workbook}} =
             CloudWorkbookAccessPolicy.authorize_workbook(
               shared_identity,
               "firebase-token",
               workbook_id
             )

    assert workbook["meta"]["id"] == workbook_id
  end

  test "shared access is rejected when the owner disables sharing" do
    owner_identity = identity("owner-3", "device-owner", "owner-3@example.com")
    shared_identity = identity("viewer-3", "device-shared", "viewer-3@example.com")
    workbook_id = unique_workbook_id()

    assert {:ok, _write_result} =
             CloudWorkbooks.write_workbook(
               owner_identity,
               "firebase-token",
               workbook_payload(workbook_id, "viewer", true),
               "seed-client"
             )

    assert {:ok, _write_result} =
             CloudWorkbooks.write_workbook(
               owner_identity,
               "firebase-token",
               workbook_payload(workbook_id, "viewer", false),
               "seed-client"
             )

    assert {:error, :forbidden} =
             CloudWorkbookAccessPolicy.authorize_workbook(
               shared_identity,
               "firebase-token",
               workbook_id
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
end
