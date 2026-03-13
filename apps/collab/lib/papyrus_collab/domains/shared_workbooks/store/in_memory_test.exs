defmodule PapyrusCollab.SharedWorkbooks.Store.InMemoryTest do
  use ExUnit.Case, async: false

  alias PapyrusCollab.SharedWorkbooks.Store.InMemory

  setup do
    :ok = InMemory.reset()
    :ok
  end

  test "reads, deletes, and resets shared workbook records" do
    assert %{id: PapyrusCollab.SharedWorkbooks.Store.InMemory} = InMemory.child_spec([])

    assert :ok =
             InMemory.sync_workbook("owner-1", %{
               "meta" => %{
                 "id" => "workbook-1",
                 "sharingAccessRole" => "editor",
                 "sharingEnabled" => true
               }
             })

    assert {:ok,
            %{
              accessRole: "editor",
              ownerId: "owner-1",
              sharingEnabled: true,
              workbookId: "workbook-1"
            }} = InMemory.read_workbook("workbook-1")

    assert :ok = InMemory.delete_workbook("workbook-1")
    assert {:ok, nil} = InMemory.read_workbook("workbook-1")

    assert :ok =
             InMemory.sync_workbook("owner-1", %{
               "meta" => %{
                 "id" => "workbook-2",
                 "sharingAccessRole" => "viewer",
                 "sharingEnabled" => true
               }
             })

    assert :ok = InMemory.reset()
    assert {:ok, nil} = InMemory.read_workbook("workbook-2")
  end

  test "rejects invalid shared workbook payloads" do
    assert {:error, :invalid_workbook_payload} = InMemory.sync_workbook("owner-1", %{})
  end
end
