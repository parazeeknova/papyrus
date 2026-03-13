defmodule PapyrusCollabWeb.UserSocketTest do
  use PapyrusCollabWeb.ChannelCase, async: true

  alias PapyrusCollabWeb.UserSocket

  test "rejects unauthenticated socket connections" do
    assert :error = connect(UserSocket, %{})
    assert :error = connect(UserSocket, %{"device_id" => "device-a", "token" => "invalid"})
  end

  test "assigns the verified user identity to the socket" do
    assert {:ok, socket} =
             connect(UserSocket, socket_params("user-1", "device-a", "user-1@example.com"))

    identity = socket.assigns.identity

    assert identity.device_id == "device-a"
    assert identity.email == "user-1@example.com"
    assert identity.user_id == "user-1"
  end

  test "assigns a guest identity for explicit guest socket connections" do
    assert {:ok, socket} = connect(UserSocket, guest_socket_params("device-guest"))

    identity = socket.assigns.identity

    refute identity.authenticated
    assert identity.device_id == "device-guest"
    assert identity.email == nil
    assert identity.user_id == "guest:device-guest"
  end
end
