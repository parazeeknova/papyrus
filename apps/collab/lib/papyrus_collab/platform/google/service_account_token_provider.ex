defmodule PapyrusCollab.Platform.Google.ServiceAccountTokenProvider do
  @moduledoc false

  use GenServer

  @behaviour PapyrusCollab.Platform.Google.AccessTokenProvider

  alias PapyrusCollab.Platform.Google.ServiceAccount

  @fetch_token_timeout_milliseconds 15_000
  @token_refresh_window_seconds 60
  @token_exchange_receive_timeout_milliseconds 10_000

  @type state :: %{
          expires_at: integer(),
          service_account: ServiceAccount.t() | nil,
          token: String.t() | nil
        }

  @spec child_spec(keyword()) :: Supervisor.child_spec()
  def child_spec(opts) do
    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [opts]}
    }
  end

  @impl true
  @spec fetch_token() :: {:ok, String.t()} | {:error, term()}
  def fetch_token do
    GenServer.call(__MODULE__, :fetch_token, @fetch_token_timeout_milliseconds)
  end

  @spec request_access_token(ServiceAccount.t()) :: {:ok, map()} | {:error, term()}
  def request_access_token(%ServiceAccount{} = service_account) do
    now_unix_seconds = System.system_time(:second)

    with {:ok, assertion} <- ServiceAccount.build_assertion(service_account, now_unix_seconds),
         {:ok, %Req.Response{status: status, body: body}} <-
           http_post().(
             service_account.token_uri,
             form: %{
               assertion: assertion,
               grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer"
             },
             receive_timeout: @token_exchange_receive_timeout_milliseconds
           ) do
      if status in 200..299 do
        {:ok, body}
      else
        {:error, {:token_exchange_http, status, body}}
      end
    else
      {:error, reason} -> {:error, reason}
    end
  end

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(_opts) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    {:ok, %{expires_at: 0, service_account: nil, token: nil}}
  end

  @impl true
  def handle_call(:fetch_token, _from, state) do
    case current_token(state) do
      {:ok, token} ->
        {:reply, {:ok, token}, state}

      :expired ->
        with {:ok, service_account} <- load_service_account(state.service_account),
             {:ok, token_response} <- requester().(service_account),
             {:ok, token, expires_at} <- normalize_token_response(token_response) do
          {:reply, {:ok, token},
           %{state | expires_at: expires_at, service_account: service_account, token: token}}
        else
          {:error, reason} ->
            {:reply, {:error, reason}, %{state | token: nil, expires_at: 0}}
        end
    end
  end

  defp current_token(%{token: token, expires_at: expires_at})
       when is_binary(token) and is_integer(expires_at) do
    if expires_at - @token_refresh_window_seconds > System.system_time(:second) do
      {:ok, token}
    else
      :expired
    end
  end

  defp current_token(_state), do: :expired

  defp load_service_account(%ServiceAccount{} = service_account), do: {:ok, service_account}
  defp load_service_account(nil), do: ServiceAccount.load()

  defp normalize_token_response(%{"access_token" => token, "expires_in" => expires_in})
       when is_binary(token) do
    with {:ok, expires_in_seconds} <- normalize_expires_in(expires_in) do
      {:ok, token, System.system_time(:second) + expires_in_seconds}
    end
  end

  defp normalize_token_response(_response), do: {:error, :invalid_token_response}

  defp normalize_expires_in(expires_in) when is_integer(expires_in) and expires_in > 0 do
    {:ok, expires_in}
  end

  defp normalize_expires_in(expires_in) when is_binary(expires_in) do
    case Integer.parse(expires_in) do
      {parsed_expires_in, ""} when parsed_expires_in > 0 ->
        {:ok, parsed_expires_in}

      _reason ->
        {:error, :invalid_token_response}
    end
  end

  defp normalize_expires_in(_expires_in), do: {:error, :invalid_token_response}

  defp requester do
    Application.get_env(:papyrus_collab, __MODULE__, [])[:requester] || (&request_access_token/1)
  end

  defp http_post do
    Application.get_env(:papyrus_collab, __MODULE__, [])[:http_post] ||
      fn url, options -> Req.post(url, options) end
  end
end
