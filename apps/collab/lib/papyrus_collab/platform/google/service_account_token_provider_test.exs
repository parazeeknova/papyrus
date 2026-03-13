defmodule PapyrusCollab.Platform.Google.ServiceAccountTokenProviderTest do
  use ExUnit.Case, async: false

  alias PapyrusCollab.Platform.Google.ServiceAccountTokenProvider

  @private_key """
  -----BEGIN PRIVATE KEY-----
  MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGBAKQuWDs/5uNa45XW
  ZmIBZODEdSX7iEFWF/AvYcdeBebGAx4ir808wKoGet78HUUH2ZN58ReSbA+ohyiI
  2N3otDaWpdHUeCRc4dfPDSBWXw70VpGAelrbBb785bZezYRQxwf2JIIE39cN5BSP
  dbilwCYnHdsJV/L9j+JDSIx0/kGvAgMBAAECgYAEZs2swPjSrZQeZ0IVbI4kzH+L
  hiPQBJvdr5eCfc3QswxQWYO3D+LmbAgNRFsQh7ZYktNY228UOGNvPcP6pwt1xDG0
  DXwn23xmAe5zR02jogr4Bwq8M94Oly5F8a/7XfdU0UNW2O0YV655MrWJFZ1VXQqW
  aWJ2/WqSJU0w/gaMwQJBANWNhknrxSmhmV6BODITHHseetKubgqmEi1la8kX1DPV
  Q7XX7krPCYBsv7KX6i4AeYM1gDqARRfjRAVAk72XEs8CQQDE0JLDMkcQ0+os36fG
  6cCwf55TpBzO4P4UAFiT+NlaxDFxFja6zXL1O8GtHVzxftb8NfLHuJcKBK++yIxI
  JxshAkBMm4ZvAisqchQouMZGAGEZMafx6C0FmOmwa0+tReUT6w9tLlcHcxn/fgOO
  t7yEYBs3HHwxgE5I8Xg3QiE9w/I1AkAcOF/i1zGzav9X4dXXwqqbZCEakxyCWWZ1
  Dbuls/fOePUx5uKAFHdYTHIv1Vb/VZWT4lRmaMRXbmaYr37V1a2hAkEAlabWSY+H
  OIB6Un2zpW4xvHPYm6fEw7V2BAEfvyLLVDdpZgKa7R4GqWB3eNyL+KGsZtt+My0S
  2ymh4BzCGZuhEA==
  -----END PRIVATE KEY-----
  """

  setup do
    provider = ServiceAccountTokenProvider
    previous_config = Application.get_env(:papyrus_collab, provider, [])

    reset_provider_state(provider)

    on_exit(fn ->
      Application.put_env(:papyrus_collab, provider, previous_config)
      reset_provider_state(provider)
    end)

    :ok
  end

  test "caches the exchanged access token until it needs refresh" do
    test_process = self()

    Application.put_env(
      :papyrus_collab,
      ServiceAccountTokenProvider,
      service_account_json:
        Jason.encode!(%{
          "client_email" => "papyrus-collab@example.com",
          "private_key" => @private_key,
          "project_id" => "papyrus-test",
          "token_uri" => "https://oauth2.googleapis.com/token"
        }),
      requester: fn _service_account ->
        send(test_process, :requested_access_token)
        {:ok, %{"access_token" => "server-token", "expires_in" => 3_600}}
      end
    )

    reset_provider_state(ServiceAccountTokenProvider)

    assert {:ok, "server-token"} = ServiceAccountTokenProvider.fetch_token()
    assert {:ok, "server-token"} = ServiceAccountTokenProvider.fetch_token()
    assert_received :requested_access_token
    refute_received :requested_access_token
  end

  defp reset_provider_state(provider) do
    case Process.whereis(provider) do
      nil ->
        :ok

      _pid ->
        :sys.replace_state(provider, fn _state ->
          %{expires_at: 0, service_account: nil, token: nil}
        end)
    end
  end
end
