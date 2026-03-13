defmodule PapyrusCollabWeb.HealthController do
  use PapyrusCollabWeb, :controller

  @spec show(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def show(conn, _params) do
    json(conn, %{status: "ok"})
  end
end
