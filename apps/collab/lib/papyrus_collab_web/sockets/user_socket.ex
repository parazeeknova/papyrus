defmodule PapyrusCollabWeb.UserSocket do
  @moduledoc false

  use Phoenix.Socket

  alias PapyrusCollab.Auth

  channel "cloud_workbooks", PapyrusCollabWeb.CloudWorkbookChannel
  channel "workbook:*", PapyrusCollabWeb.WorkbookChannel

  @impl true
  def connect(params, socket, _connect_info) do
    case Auth.authenticate_socket(params) do
      {:ok, identity} ->
        {:ok, assign(socket, :identity, identity)}

      :error ->
        :error
    end
  end

  @impl true
  def id(socket) do
    "user_socket:" <> socket.assigns.identity.user_id
  end
end
