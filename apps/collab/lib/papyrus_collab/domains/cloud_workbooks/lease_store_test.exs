defmodule PapyrusCollab.CloudWorkbooks.LeaseStoreTest do
  use ExUnit.Case, async: false

  alias PapyrusCollab.CloudWorkbooks.LeaseStore

  setup do
    LeaseStore.reset()

    on_exit(fn ->
      LeaseStore.reset()
    end)

    :ok
  end

  test "renews an existing lease for the same client" do
    assert LeaseStore.acquire("user-1", "workbook-1", "client-1")
    refute LeaseStore.acquire("user-1", "workbook-1", "client-2")
    assert LeaseStore.acquire("user-1", "workbook-1", "client-1")
  end

  test "allows a different client to acquire an expired lease" do
    :sys.replace_state(LeaseStore, fn _leases ->
      %{
        {"user-2", "workbook-2"} => %{
          client_id: "client-expired",
          expires_at: System.system_time(:millisecond) - 1
        }
      }
    end)

    assert LeaseStore.acquire("user-2", "workbook-2", "client-fresh")
  end

  test "releases and resets tracked leases" do
    assert LeaseStore.acquire("user-3", "workbook-3", "client-3")

    assert :ok = LeaseStore.release("user-3", "workbook-3")
    assert LeaseStore.acquire("user-3", "workbook-3", "client-4")

    assert :ok = LeaseStore.reset()
    assert LeaseStore.acquire("user-3", "workbook-3", "client-5")
  end
end
