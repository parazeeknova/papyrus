defmodule PapyrusCollab.Firebase.PublicKeys do
  @moduledoc false

  use Agent

  @certificates_url "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
  @fallback_cache_ttl_seconds 3_600

  @type state :: %{expires_at: non_neg_integer(), keys: %{optional(String.t()) => JOSE.JWK.t()}}

  @spec child_spec(keyword()) :: Supervisor.child_spec()
  def child_spec(opts) do
    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [opts]}
    }
  end

  @spec lookup(String.t()) :: {:ok, JOSE.JWK.t()} | :error
  def lookup(kid) when is_binary(kid) and byte_size(kid) > 0 do
    with {:ok, keys} <- current_keys(),
         {:ok, key} <- Map.fetch(keys, kid) do
      {:ok, key}
    else
      _reason -> :error
    end
  end

  @spec start_link(keyword()) :: Agent.on_start()
  def start_link(_opts) do
    Agent.start_link(fn -> %{expires_at: 0, keys: %{}} end, name: __MODULE__)
  end

  defp current_keys do
    state = Agent.get(__MODULE__, & &1)
    current_time = System.system_time(:second)

    if state.expires_at > current_time and map_size(state.keys) > 0 do
      {:ok, state.keys}
    else
      refresh_keys(state)
    end
  end

  defp refresh_keys(previous_state) do
    case fetch_remote_keys() do
      {:ok, next_state} ->
        Agent.update(__MODULE__, fn _current_state -> next_state end)
        {:ok, next_state.keys}

      :error when map_size(previous_state.keys) > 0 ->
        {:ok, previous_state.keys}

      :error ->
        :error
    end
  end

  defp fetch_remote_keys do
    with {:ok, body, headers} <- fetch_certificates(),
         {:ok, certificates} <- Jason.decode(body) do
      current_time = System.system_time(:second)

      {:ok,
       %{
         expires_at: current_time + cache_ttl_seconds(headers),
         keys: build_jwk_map(certificates)
       }}
    else
      _reason -> :error
    end
  end

  defp fetch_certificates do
    request = {@certificates_url |> String.to_charlist(), []}

    case requester().(request) do
      {:ok, {{_http_version, 200, _reason_phrase}, headers, body}} ->
        {:ok, body, headers}

      _response ->
        :error
    end
  end

  defp build_jwk_map(certificates) when is_map(certificates) do
    Map.new(certificates, fn {kid, certificate} ->
      {kid, JOSE.JWK.from_pem(certificate)}
    end)
  end

  defp cache_ttl_seconds(headers) when is_list(headers) do
    headers
    |> Enum.find_value(@fallback_cache_ttl_seconds, fn {header_name, value} ->
      if String.downcase(List.to_string(header_name)) == "cache-control" do
        extract_max_age(List.to_string(value))
      else
        nil
      end
    end)
  end

  defp extract_max_age(cache_control) when is_binary(cache_control) do
    case Regex.run(~r/max-age=(\d+)/, cache_control, capture: :all_but_first) do
      [value] ->
        String.to_integer(value)

      _no_match ->
        @fallback_cache_ttl_seconds
    end
  end

  defp requester do
    Application.get_env(:papyrus_collab, __MODULE__, [])[:requester] ||
      fn request ->
        :httpc.request(:get, request, [], body_format: :binary)
      end
  end
end
