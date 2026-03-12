defmodule PapyrusCollabWeb.WorkbookChannel do
  @moduledoc false

  use PapyrusCollabWeb, :channel

  alias PapyrusCollab.Collaboration
  alias PapyrusCollab.Collaboration.Snapshot
  alias PapyrusCollabWeb.Presence

  @impl true
  def join("workbook:" <> workbook_id, _params, socket)
      when byte_size(workbook_id) > 0 do
    with {:ok, snapshot} <- Collaboration.fetch_snapshot(workbook_id) do
      send(self(), :after_join)
      {:ok, serialize_snapshot(snapshot), assign(socket, :workbook_id, workbook_id)}
    end
  end

  def join("workbook:", _params, _socket) do
    {:error, %{reason: "invalid_workbook_id"}}
  end

  @impl true
  def handle_in("snapshot:push", %{"payload" => payload}, socket) do
    identity = socket.assigns.identity

    with {:ok, snapshot} <-
           Collaboration.apply_snapshot(socket.assigns.workbook_id, payload, identity) do
      response = serialize_snapshot(snapshot)
      broadcast_from!(socket, "snapshot:applied", response)
      {:reply, {:ok, response}, socket}
    end
  end

  def handle_in("snapshot:push", _payload, socket) do
    {:reply, {:error, %{reason: "payload_required"}}, socket}
  end

  @impl true
  def handle_info(:after_join, socket) do
    identity = socket.assigns.identity

    # Track each device separately so the same user can join from multiple
    # browsers while Presence still exposes a stable user identity.
    {:ok, _presence} =
      Presence.track(socket, identity.device_id, %{
        email: identity.email,
        joinedAt: DateTime.utc_now() |> DateTime.to_iso8601(),
        userId: identity.user_id
      })

    push(socket, "presence_state", Presence.list(socket))
    {:noreply, socket}
  end

  defp serialize_snapshot(%Snapshot{} = snapshot) do
    %{
      payload: snapshot.payload,
      updatedAt: DateTime.to_iso8601(snapshot.updated_at),
      updatedBy: snapshot.updated_by,
      version: snapshot.version,
      workbookId: snapshot.workbook_id
    }
  end
end
