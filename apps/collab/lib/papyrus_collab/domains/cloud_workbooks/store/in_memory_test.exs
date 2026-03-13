defmodule PapyrusCollab.CloudWorkbooks.Store.InMemoryTest do
  use ExUnit.Case, async: false

  alias PapyrusCollab.CloudWorkbooks.Store.InMemory

  setup do
    :ok = InMemory.reset()
    :ok
  end

  test "writes, sorts, reads, and deletes normalized workbooks" do
    assert %{id: PapyrusCollab.CloudWorkbooks.Store.InMemory} = InMemory.child_spec([])

    assert {:ok, %{version: 2}} =
             InMemory.write_workbook(
               "user-1",
               workbook_payload("workbook-1", "2026-03-14T00:00:00.000Z", 1, -1, 42),
               "client-a"
             )

    assert {:ok, %{version: 1}} =
             InMemory.write_workbook(
               "user-1",
               workbook_payload("workbook-2", "2026-03-13T00:00:00.000Z", 0, nil, nil),
               "client-b"
             )

    assert {:ok, [first, second]} = InMemory.list_workbooks("user-1")
    assert first["id"] == "workbook-1"
    assert second["id"] == "workbook-2"

    assert {:ok, workbook} = InMemory.read_workbook("user-1", "workbook-1")
    assert is_binary(workbook["meta"]["lastSyncedAt"])
    assert workbook["meta"]["remoteVersion"] == 2

    assert :ok = InMemory.delete_workbook("user-1", "workbook-1")
    assert {:ok, nil} = InMemory.read_workbook("user-1", "workbook-1")
  end

  test "rejects invalid workbook payloads" do
    assert {:error, :invalid_workbook_meta} = InMemory.write_workbook("user-1", %{}, "client-a")

    assert {:error, {:invalid_string, "activeSheetId"}} =
             InMemory.write_workbook(
               "user-1",
               workbook_payload("workbook-invalid", "2026-03-13T00:00:00.000Z", 0, nil, nil)
               |> Map.put("activeSheetId", ""),
               "client-a"
             )

    assert {:error, {:invalid_boolean, "sharingEnabled"}} =
             InMemory.write_workbook(
               "user-1",
               put_in(
                 workbook_payload("workbook-invalid", "2026-03-13T00:00:00.000Z", 0, nil, nil),
                 ["meta", "sharingEnabled"],
                 "yes"
               ),
               "client-a"
             )

    assert {:error, {:invalid_integer, "version"}} =
             InMemory.write_workbook(
               "user-1",
               workbook_payload("workbook-invalid", "2026-03-13T00:00:00.000Z", -1, nil, nil),
               "client-a"
             )

    assert {:error, {:invalid_string, "updateBase64"}} =
             InMemory.write_workbook(
               "user-1",
               workbook_payload("workbook-invalid", "2026-03-13T00:00:00.000Z", 0, nil, nil)
               |> Map.put("updateBase64", 123),
               "client-a"
             )
  end

  test "preserves optional remote metadata only when the types are valid" do
    assert {:ok, %{version: 1}} =
             InMemory.write_workbook(
               "user-1",
               workbook_payload(
                 "workbook-optional",
                 "2026-03-13T00:00:00.000Z",
                 0,
                 7,
                 "2026-03-13T01:00:00.000Z"
               ),
               "client-a"
             )

    assert {:ok, workbook} = InMemory.read_workbook("user-1", "workbook-optional")
    assert workbook["meta"]["remoteVersion"] == 1
    assert is_binary(workbook["meta"]["lastSyncedAt"])

    assert {:ok, %{version: 1}} =
             InMemory.write_workbook(
               "user-2",
               workbook_payload(
                 "workbook-invalid-optional",
                 "2026-03-13T00:00:00.000Z",
                 0,
                 "bad",
                 123
               ),
               "client-b"
             )

    assert {:ok, invalid_optional_workbook} =
             InMemory.read_workbook("user-2", "workbook-invalid-optional")

    assert invalid_optional_workbook["meta"]["remoteVersion"] == 1
    assert is_binary(invalid_optional_workbook["meta"]["lastSyncedAt"])
  end

  defp workbook_payload(workbook_id, updated_at, version, remote_version, last_synced_at) do
    %{
      "activeSheetId" => nil,
      "meta" => %{
        "createdAt" => "2026-03-13T00:00:00.000Z",
        "id" => workbook_id,
        "isFavorite" => false,
        "lastOpenedAt" => "2026-03-13T00:00:00.000Z",
        "lastSyncedAt" => last_synced_at,
        "name" => "Budget",
        "remoteVersion" => remote_version,
        "sharingAccessRole" => "viewer",
        "sharingEnabled" => true,
        "updatedAt" => updated_at
      },
      "updateBase64" => "AQID",
      "version" => version
    }
  end
end
