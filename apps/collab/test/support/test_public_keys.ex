defmodule PapyrusCollab.Firebase.TestPublicKeys do
  @moduledoc false

  @spec lookup(String.t()) :: {:ok, JOSE.JWK.t()} | :error
  def lookup(kid) when is_binary(kid) do
    case Process.get({__MODULE__, :keys}, %{}) do
      %{^kid => key} -> {:ok, key}
      _keys -> :error
    end
  end

  @spec put_key(String.t(), JOSE.JWK.t()) :: :ok
  def put_key(kid, key) when is_binary(kid) do
    current_keys = Process.get({__MODULE__, :keys}, %{})
    Process.put({__MODULE__, :keys}, Map.put(current_keys, kid, key))
    :ok
  end
end
