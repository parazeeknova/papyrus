defmodule PapyrusCollabWeb.ChannelCaseTest do
  use ExUnit.Case, async: true

  alias PapyrusCollab.Auth.TestTokenVerifier
  alias PapyrusCollabWeb.ChannelCase

  test "builds socket params even when the email is omitted" do
    params = ChannelCase.socket_params("user-1", "device-1")

    assert params["device_id"] == "device-1"
    assert is_binary(params["token"])

    assert {:ok, %{"email" => nil, "user_id" => "user-1"}} =
             TestTokenVerifier.verify(params["token"])
  end
end
