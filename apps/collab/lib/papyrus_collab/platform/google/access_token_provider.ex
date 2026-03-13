defmodule PapyrusCollab.Platform.Google.AccessTokenProvider do
  @moduledoc false

  @callback fetch_token() :: {:ok, String.t()} | {:error, term()}

  @spec fetch_token() :: {:ok, String.t()} | {:error, term()}
  def fetch_token do
    adapter().fetch_token()
  end

  @spec adapter() :: module()
  def adapter do
    Application.fetch_env!(:papyrus_collab, __MODULE__)[:adapter]
  end
end
