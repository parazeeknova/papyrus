defmodule PapyrusCollab.Auth do
  @moduledoc false

  alias PapyrusCollab.Auth.Identity

  @spec authenticate_socket(map()) :: {:ok, Identity.t()} | :error
  def authenticate_socket(params) when is_map(params) do
    with token when is_binary(token) <- Map.get(params, "token"),
         {:ok, claims} <- verifier().verify(token),
         {:ok, identity} <- Identity.from_claims(claims),
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

    module = verifier()

    if Code.ensure_loaded?(module) and function_exported?(module, :sign, 1) do
      module.sign(claims)
    else
      raise ArgumentError,
            "the configured auth verifier does not support signing test socket tokens"
    end
  end

  defp fetch_device_id(%{"device_id" => device_id})
       when is_binary(device_id) and byte_size(device_id) > 0 do
    {:ok, device_id}
  end

  defp fetch_device_id(_params), do: :error

  defp verifier do
    Application.fetch_env!(:papyrus_collab, __MODULE__)[:id_token_verifier]
  end
end
