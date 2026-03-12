defmodule PapyrusCollab.Auth do
  @moduledoc false

  alias PapyrusCollab.Auth.Identity
  alias PapyrusCollabWeb.Endpoint

  @socket_token_max_age 86_400
  @socket_token_salt "collaboration socket"

  @spec authenticate_socket(map()) :: {:ok, Identity.t()} | :error
  def authenticate_socket(params) when is_map(params) do
    with token when is_binary(token) <- Map.get(params, "token"),
         {:ok, identity} <- verify_socket_token(token),
         {:ok, device_id} <- fetch_device_id(params) do
      {:ok, Identity.with_device_id(identity, device_id)}
    else
      _reason -> :error
    end
  end

  @spec sign_socket_token(Identity.t()) :: String.t()
  def sign_socket_token(%Identity{} = identity) do
    claims = %{
      "email" => identity.email,
      "user_id" => identity.user_id
    }

    Phoenix.Token.sign(Endpoint, @socket_token_salt, claims)
  end

  @spec verify_socket_token(String.t()) :: {:ok, Identity.t()} | :error
  def verify_socket_token(token) when is_binary(token) do
    case Phoenix.Token.verify(Endpoint, @socket_token_salt, token, max_age: @socket_token_max_age) do
      {:ok, claims} -> Identity.from_claims(claims)
      {:error, _reason} -> :error
    end
  end

  defp fetch_device_id(%{"device_id" => device_id})
       when is_binary(device_id) and byte_size(device_id) > 0 do
    {:ok, device_id}
  end

  defp fetch_device_id(_params), do: :error
end
