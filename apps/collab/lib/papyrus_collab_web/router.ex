defmodule PapyrusCollabWeb.Router do
  use PapyrusCollabWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/api", PapyrusCollabWeb do
    pipe_through :api

    get "/health", HealthController, :show
    options "/e2e/session", E2EAuthController, :options
    post "/e2e/session", E2EAuthController, :create
  end
end
