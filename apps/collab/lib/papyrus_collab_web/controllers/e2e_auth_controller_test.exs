defmodule PapyrusCollabWeb.E2EAuthControllerTest do
  use PapyrusCollabWeb.ConnCase, async: false

  defmodule VerifyOnlyStub do
    @behaviour PapyrusCollab.Auth.TokenVerifier

    @impl true
    def verify(_token), do: {:ok, %{"sub" => "user-1"}}
  end

  setup do
    previous_enabled = Application.get_env(:papyrus_collab, :e2e_auth_enabled, false)
    previous_app_env = Application.get_env(:papyrus_collab, :app_env)
    previous_auth_config = Application.get_env(:papyrus_collab, PapyrusCollab.Auth)

    on_exit(fn ->
      restore_env(:papyrus_collab, :app_env, previous_app_env)
      restore_env(:papyrus_collab, PapyrusCollab.Auth, previous_auth_config)
      restore_env(:papyrus_collab, :e2e_auth_enabled, previous_enabled)
    end)

    :ok
  end

  test "issues a signed test socket token when e2e auth is enabled", %{conn: conn} do
    Application.put_env(:papyrus_collab, :e2e_auth_enabled, true)

    response =
      conn
      |> put_req_header("content-type", "application/json")
      |> post(~p"/api/e2e/session", %{
        "displayName" => "Papyrus Owner",
        "email" => "owner@example.com",
        "uid" => "owner-user"
      })
      |> json_response(200)

    assert %{
             "token" => token,
             "user" => %{
               "displayName" => "Papyrus Owner",
               "email" => "owner@example.com",
               "uid" => "owner-user"
             }
           } = response

    assert is_binary(token)
    assert byte_size(token) > 0
  end

  test "responds to the E2E auth preflight request when E2E auth is enabled", %{conn: conn} do
    Application.put_env(:papyrus_collab, :e2e_auth_enabled, true)

    conn =
      conn
      |> put_req_header("origin", "http://127.0.0.1:3000")
      |> options(~p"/api/e2e/session")

    assert response(conn, 204) == ""
    assert get_resp_header(conn, "access-control-allow-origin") == ["http://127.0.0.1:3000"]
    assert get_resp_header(conn, "access-control-allow-methods") == ["OPTIONS, POST"]
    assert get_resp_header(conn, "access-control-allow-headers") == ["content-type"]
    assert get_resp_header(conn, "vary") == ["Origin"]
  end

  test "rejects unexpected cross-origin e2e auth requests", %{conn: conn} do
    Application.put_env(:papyrus_collab, :e2e_auth_enabled, true)

    conn =
      conn
      |> put_req_header("origin", "https://evil.example.com")
      |> options(~p"/api/e2e/session")

    assert response(conn, 403) == "Forbidden"
    assert get_resp_header(conn, "access-control-allow-origin") == []
  end

  test "rejects non-loopback e2e auth requests even when enabled", %{conn: conn} do
    Application.put_env(:papyrus_collab, :e2e_auth_enabled, true)

    assert conn
           |> Map.put(:remote_ip, {10, 0, 0, 8})
           |> put_req_header("content-type", "application/json")
           |> post(~p"/api/e2e/session", %{
             "email" => "owner@example.com",
             "uid" => "owner-user"
           })
           |> response(403) == "Forbidden"
  end

  test "returns not found when e2e auth is disabled", %{conn: conn} do
    Application.put_env(:papyrus_collab, :e2e_auth_enabled, false)

    assert conn
           |> put_req_header("content-type", "application/json")
           |> post(~p"/api/e2e/session", %{
             "email" => "owner@example.com",
             "uid" => "owner-user"
           })
           |> response(404)
  end

  test "rejects invalid e2e session payloads and trims optional strings", %{conn: conn} do
    Application.put_env(:papyrus_collab, :e2e_auth_enabled, true)

    invalid_response =
      conn
      |> put_req_header("content-type", "application/json")
      |> post(~p"/api/e2e/session", %{
        "displayName" => "   ",
        "email" => "",
        "photoURL" => "   ",
        "uid" => "owner-user"
      })
      |> json_response(422)

    assert invalid_response == %{"error" => "invalid_e2e_session_request"}

    trimmed_response =
      build_conn()
      |> put_req_header("content-type", "application/json")
      |> post(~p"/api/e2e/session", %{
        "displayName" => "  Papyrus Owner  ",
        "email" => "owner@example.com",
        "photoURL" => "  https://example.com/avatar.png  ",
        "uid" => "owner-user"
      })
      |> json_response(200)

    assert trimmed_response["user"]["displayName"] == "Papyrus Owner"
    assert trimmed_response["user"]["photoURL"] == "https://example.com/avatar.png"
  end

  test "returns not found when e2e auth is enabled outside test", %{conn: conn} do
    Application.put_env(:papyrus_collab, :app_env, :prod)
    Application.put_env(:papyrus_collab, :e2e_auth_enabled, true)

    assert conn
           |> put_req_header("content-type", "application/json")
           |> post(~p"/api/e2e/session", %{
             "email" => "owner@example.com",
             "uid" => "owner-user"
           })
           |> response(404)
  end

  test "returns not found when no socket token signer is configured", %{
    conn: conn
  } do
    Application.put_env(:papyrus_collab, :e2e_auth_enabled, true)

    Application.put_env(
      :papyrus_collab,
      PapyrusCollab.Auth,
      id_token_verifier: VerifyOnlyStub,
      socket_token_signer: nil
    )

    assert conn
           |> put_req_header("content-type", "application/json")
           |> post(~p"/api/e2e/session", %{
             "email" => "owner@example.com",
             "uid" => "owner-user"
           })
           |> response(404)
  end

  defp restore_env(app, key, nil), do: Application.delete_env(app, key)
  defp restore_env(app, key, value), do: Application.put_env(app, key, value)
end
