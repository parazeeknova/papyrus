defmodule PapyrusCollabWeb.E2EAuthControllerTest do
  use PapyrusCollabWeb.ConnCase, async: true

  setup do
    previous_value = Application.get_env(:papyrus_collab, :e2e_auth_enabled, false)

    on_exit(fn ->
      Application.put_env(:papyrus_collab, :e2e_auth_enabled, previous_value)
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
    assert get_resp_header(conn, "access-control-allow-origin") == ["*"]
    assert get_resp_header(conn, "access-control-allow-methods") == ["OPTIONS, POST"]
    assert get_resp_header(conn, "access-control-allow-headers") == ["content-type"]
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
end
