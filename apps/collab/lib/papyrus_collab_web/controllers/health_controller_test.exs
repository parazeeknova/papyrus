defmodule PapyrusCollabWeb.HealthControllerTest do
  use PapyrusCollabWeb.ConnCase, async: true

  test "reports the health status", %{conn: conn} do
    assert conn
           |> get(~p"/api/health")
           |> json_response(200) == %{"status" => "ok"}
  end
end
