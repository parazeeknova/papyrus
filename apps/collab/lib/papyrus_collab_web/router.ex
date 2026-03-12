defmodule PapyrusCollabWeb.Router do
  use PapyrusCollabWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/api", PapyrusCollabWeb do
    pipe_through :api
  end
end
