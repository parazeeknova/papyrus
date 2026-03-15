defmodule PapyrusCollabWeb.E2EAuthController do
  use PapyrusCollabWeb, :controller

  alias PapyrusCollab.Auth
  alias PapyrusCollab.Auth.Identity

  plug :ensure_e2e_auth_enabled
  plug :ensure_local_e2e_request
  plug :allow_e2e_cors

  @spec options(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def options(conn, _params) do
    send_resp(conn, :no_content, "")
  end

  @spec create(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def create(conn, params) when is_map(params) do
    with {:ok, user_id} <- fetch_required_string(params, "uid"),
         {:ok, email} <- fetch_required_string(params, "email") do
      identity = %Identity{
        device_id: "e2e-browser",
        email: email,
        user_id: user_id
      }

      json(conn, %{
        token: Auth.sign_socket_token(identity),
        user: %{
          displayName: fetch_optional_string(params, "displayName"),
          email: email,
          photoURL: fetch_optional_string(params, "photoURL"),
          uid: user_id
        }
      })
    else
      _reason ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "invalid_e2e_session_request"})
    end
  end

  defp allow_e2e_cors(conn, _opts) do
    case List.first(get_req_header(conn, "origin")) do
      nil ->
        conn

      origin when is_binary(origin) ->
        if allowed_e2e_origin?(origin) do
          conn
          |> put_resp_header("access-control-allow-origin", origin)
          |> put_resp_header("access-control-allow-methods", "OPTIONS, POST")
          |> put_resp_header("access-control-allow-headers", "content-type")
          |> put_resp_header("vary", "Origin")
        else
          conn
          |> send_resp(:forbidden, "Forbidden")
          |> halt()
        end
    end
  end

  defp ensure_local_e2e_request(%Plug.Conn{remote_ip: remote_ip} = conn, _opts) do
    if loopback_ip?(remote_ip) do
      conn
    else
      conn
      |> send_resp(:forbidden, "Forbidden")
      |> halt()
    end
  end

  defp ensure_e2e_auth_enabled(conn, _opts) do
    if e2e_auth_available?() do
      conn
    else
      conn
      |> send_resp(:not_found, "Not Found")
      |> halt()
    end
  end

  defp allowed_e2e_origin?(origin) when is_binary(origin) do
    case PapyrusCollabWeb.Endpoint.config(:check_origin) do
      origins when is_list(origins) -> Enum.member?(origins, origin)
      _origins -> false
    end
  end

  defp e2e_auth_available? do
    Application.get_env(:papyrus_collab, :e2e_auth_enabled, false) and
      Application.get_env(:papyrus_collab, :app_env) == :test and
      Auth.supports_socket_token_signing?()
  end

  defp loopback_ip?({127, _, _, _}), do: true
  defp loopback_ip?({0, 0, 0, 0, 0, 0, 0, 1}), do: true
  defp loopback_ip?(_remote_ip), do: false

  defp fetch_optional_string(params, key) when is_map(params) and is_binary(key) do
    case Map.get(params, key) do
      value when is_binary(value) ->
        trimmed_value = String.trim(value)

        if byte_size(trimmed_value) > 0 do
          trimmed_value
        else
          nil
        end

      _value ->
        nil
    end
  end

  defp fetch_required_string(params, key) when is_map(params) and is_binary(key) do
    case fetch_optional_string(params, key) do
      value when is_binary(value) -> {:ok, value}
      nil -> :error
    end
  end
end
