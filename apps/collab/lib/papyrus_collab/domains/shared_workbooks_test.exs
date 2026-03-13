defmodule PapyrusCollab.SharedWorkbooksTest do
  use ExUnit.Case, async: false

  alias PapyrusCollab.SharedWorkbooks

  setup do
    :ok = SharedWorkbooks.reset()
    :ok
  end

  test "syncs enabled workbooks and removes disabled ones" do
    assert :ok = SharedWorkbooks.sync_workbook("owner-1", workbook_payload("workbook-1", true))

    assert {:ok, shared_workbook} = SharedWorkbooks.read_workbook("workbook-1")

    assert shared_workbook == %{
             accessRole: "viewer",
             ownerId: "owner-1",
             sharingEnabled: true,
             workbookId: "workbook-1"
           }

    assert :ok = SharedWorkbooks.sync_workbook("owner-1", workbook_payload("workbook-1", false))
    assert {:ok, nil} = SharedWorkbooks.read_workbook("workbook-1")
  end

  test "validates shared workbook ids and payloads" do
    assert {:error, :invalid_workbook_id} = SharedWorkbooks.delete_workbook("")
    assert {:error, :invalid_workbook_id} = SharedWorkbooks.read_workbook("")
    assert {:error, :invalid_workbook_payload} = SharedWorkbooks.sync_workbook("", %{})
  end

  defp workbook_payload(workbook_id, sharing_enabled) do
    %{
      "meta" => %{
        "id" => workbook_id,
        "sharingAccessRole" => "viewer",
        "sharingEnabled" => sharing_enabled
      }
    }
  end
end
