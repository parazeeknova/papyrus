defmodule PapyrusCollab.Auth.TestTokenVerifier do
  @moduledoc false

  @behaviour PapyrusCollab.Auth.TokenVerifier

  alias PapyrusCollabWeb.Endpoint

  @token_max_age 86_400
  @token_salt "collaboration socket test token"

  @impl true
  @spec verify(String.t()) :: {:ok, map()} | :error
  def verify(token) when is_binary(token) do
    case Phoenix.Token.verify(Endpoint, @token_salt, token, max_age: @token_max_age) do
      {:ok, claims} -> {:ok, claims}
      {:error, _reason} -> :error
    end
  end

  @spec sign(map()) :: String.t()
  def sign(claims) when is_map(claims) do
    Phoenix.Token.sign(Endpoint, @token_salt, claims)
  end
end
