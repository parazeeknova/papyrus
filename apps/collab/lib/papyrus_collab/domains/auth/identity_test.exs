defmodule PapyrusCollab.Auth.IdentityTest do
  use ExUnit.Case, async: true

  alias PapyrusCollab.Auth.Identity

  test "builds identities from both firebase and test-token claim shapes" do
    assert {:ok, %Identity{device_id: "pending", email: "ada@example.com", user_id: "user-sub"}} =
             Identity.from_claims(%{"email" => "ada@example.com", "sub" => "user-sub"})

    assert {:ok, %Identity{device_id: "pending", email: nil, user_id: "user-claim"}} =
             Identity.from_claims(%{"user_id" => "user-claim"})
  end

  test "rejects invalid claims and replaces the device id" do
    assert :error = Identity.from_claims(%{"sub" => ""})
    assert :error = Identity.from_claims(%{})

    assert %Identity{device_id: "device-1"} =
             Identity.with_device_id(
               %Identity{device_id: "pending", email: nil, user_id: "user-1"},
               "device-1"
             )
  end
end
