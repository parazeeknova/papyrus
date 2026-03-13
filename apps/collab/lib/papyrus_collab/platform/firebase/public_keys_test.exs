defmodule PapyrusCollab.Firebase.PublicKeysTest do
  use ExUnit.Case, async: false

  alias PapyrusCollab.Firebase.PublicKeys

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
    previous_config = Application.get_env(:papyrus_collab, PublicKeys)
    reset_public_keys()

    on_exit(fn ->
      restore_env(:papyrus_collab, PublicKeys, previous_config)
      reset_public_keys()
    end)

    :ok
  end

  test "fetches and caches remote firebase public keys" do
    test_pid = self()

    Application.put_env(
      :papyrus_collab,
      PublicKeys,
      requester: fn _request ->
        send(test_pid, :requested_public_keys)

        {:ok,
         {{~c"HTTP/1.1", 200, ~c"OK"}, [{~c"cache-control", ~c"public, max-age=3600"}],
          Jason.encode!(%{"kid-1" => @private_key})}}
      end
    )

    assert {:ok, %JOSE.JWK{}} = PublicKeys.lookup("kid-1")
    assert_received :requested_public_keys

    assert {:ok, %JOSE.JWK{}} = PublicKeys.lookup("kid-1")
    refute_received :requested_public_keys
    assert :error = PublicKeys.lookup("missing-kid")
  end

  test "returns errors when key refresh fails" do
    Application.put_env(
      :papyrus_collab,
      PublicKeys,
      requester: fn _request ->
        {:ok,
         {{~c"HTTP/1.1", 200, ~c"OK"}, [{~c"cache-control", ~c"public, max-age=0"}],
          Jason.encode!(%{"kid-cached" => @private_key})}}
      end
    )

    assert {:ok, %JOSE.JWK{}} = PublicKeys.lookup("kid-cached")

    reset_public_keys()

    Application.put_env(
      :papyrus_collab,
      PublicKeys,
      requester: fn _request -> {:error, :timeout} end
    )

    assert :error = PublicKeys.lookup("kid-cached")

    Application.put_env(
      :papyrus_collab,
      PublicKeys,
      requester: fn _request ->
        {:ok, {{~c"HTTP/1.1", 500, ~c"ERR"}, [], ""}}
      end
    )

    assert :error = PublicKeys.lookup("kid-cached")

    Application.put_env(
      :papyrus_collab,
      PublicKeys,
      requester: fn _request ->
        {:ok, {{~c"HTTP/1.1", 200, ~c"OK"}, [{~c"cache-control", ~c"public"}], "not-json"}}
      end
    )

    assert :error = PublicKeys.lookup("kid-cached")
  end

  test "uses the fallback ttl when cache-control has no max-age" do
    Application.put_env(
      :papyrus_collab,
      PublicKeys,
      requester: fn _request ->
        {:ok,
         {{~c"HTTP/1.1", 200, ~c"OK"}, [{~c"cache-control", ~c"public"}],
          Jason.encode!(%{"kid-fallback" => @private_key})}}
      end
    )

    assert {:ok, %JOSE.JWK{}} = PublicKeys.lookup("kid-fallback")
  end

  test "falls back to cached keys when a refresh fails" do
    cached_key = JOSE.JWK.from_pem(@private_key)

    :sys.replace_state(PublicKeys, fn _state ->
      %{expires_at: 0, keys: %{"kid-cached" => cached_key}}
    end)

    Application.put_env(
      :papyrus_collab,
      PublicKeys,
      requester: fn _request -> :error end
    )

    assert {:ok, %JOSE.JWK{}} = PublicKeys.lookup("kid-cached")
  end

  test "uses the default http requester when no override is configured" do
    Application.delete_env(:papyrus_collab, PublicKeys)
    reset_public_keys()

    assert :error = PublicKeys.lookup("kid-default")
  end

  defp reset_public_keys do
    :sys.replace_state(PublicKeys, fn _state ->
      %{expires_at: 0, keys: %{}}
    end)
  end

  defp restore_env(app, key, nil), do: Application.delete_env(app, key)
  defp restore_env(app, key, value), do: Application.put_env(app, key, value)
end
