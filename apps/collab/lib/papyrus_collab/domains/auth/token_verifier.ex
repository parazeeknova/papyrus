defmodule PapyrusCollab.Auth.TokenVerifier do
  @moduledoc false

  @callback verify(String.t()) :: {:ok, map()} | :error
end
