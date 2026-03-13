defmodule PapyrusCollab.AuthTest do
  use ExUnit.Case, async: false

  alias PapyrusCollab.Auth
  alias PapyrusCollab.Auth.Identity

  defmodule VerifyOnlyStub do
    @behaviour PapyrusCollab.Auth.TokenVerifier

    @impl true
    def verify("valid-token"), do: {:ok, %{"sub" => "user-1"}}
    def verify(_token), do: :error
  end

  setup do
    previous_config = Application.get_env(:papyrus_collab, PapyrusCollab.Auth)

    Application.put_env(
      :papyrus_collab,
      PapyrusCollab.Auth,
      id_token_verifier: PapyrusCollab.Auth.TestTokenVerifier
    )

    on_exit(fn ->
      restore_env(:papyrus_collab, PapyrusCollab.Auth, previous_config)
    end)

    :ok
  end

  test "authenticates signed socket params and requires a device id" do
    token =
      Auth.sign_socket_token(%Identity{
        device_id: "ignored",
        email: "ada@example.com",
        user_id: "user-1"
      })

    assert {:ok, %Identity{device_id: "device-1", email: "ada@example.com", user_id: "user-1"}} =
             Auth.authenticate_socket(%{"device_id" => "device-1", "token" => token})

    assert :error = Auth.authenticate_socket(%{"token" => token})
    assert :error = Auth.authenticate_socket(%{"device_id" => "device-1"})
  end

  test "authenticates explicit guest socket params without a firebase token" do
    assert {:ok,
            %Identity{
              authenticated: false,
              device_id: "device-guest",
              email: nil,
              user_id: "guest:device-guest"
            }} =
             Auth.authenticate_socket(%{
               "device_id" => "device-guest",
               "guest" => true
             })

    assert :error =
             Auth.authenticate_socket(%{
               "device_id" => "device-guest",
               "guest" => false
             })
  end

  test "raises when the configured verifier cannot sign test socket tokens" do
    Application.put_env(
      :papyrus_collab,
      PapyrusCollab.Auth,
      id_token_verifier: VerifyOnlyStub
    )

    assert_raise ArgumentError, ~r/does not support signing/, fn ->
      Auth.sign_socket_token(%Identity{
        device_id: "device-1",
        email: nil,
        user_id: "user-1"
      })
    end
  end

  defp restore_env(app, key, nil), do: Application.delete_env(app, key)
  defp restore_env(app, key, value), do: Application.put_env(app, key, value)
end
