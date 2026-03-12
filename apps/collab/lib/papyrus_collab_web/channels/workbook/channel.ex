defmodule PapyrusCollabWeb.WorkbookChannel do
  @moduledoc false

  use PapyrusCollabWeb, :channel

  alias PapyrusCollab.CloudWorkbooks
  alias PapyrusCollab.Collaboration
  alias PapyrusCollab.Collaboration.Snapshot
  alias PapyrusCollabWeb.Endpoint

  @impl true
  def join("workbook:" <> workbook_id, _params, socket)
      when byte_size(workbook_id) > 0 do
    identity = socket.assigns.identity
    token = socket.assigns.firebase_token

    with {:ok, %{access_role: access_role, owner_id: owner_id, workbook: workbook}} <-
           Collaboration.authorize_realtime_workbook(identity, token, workbook_id),
         {:ok, snapshot} <-
           maybe_bootstrap_snapshot(workbook_id, workbook, identity),
         {:ok, peers} <- Collaboration.join_peer(workbook_id, identity, access_role) do
      {:ok,
       %{
         accessRole: access_role,
         peers: serialize_peers(peers),
         pendingUpdates: Enum.map(snapshot.pending_updates, & &1.update),
         shouldInitializeFromClient: is_nil(snapshot.base_update),
         update: snapshot.base_update,
         version: snapshot.version,
         workbookId: workbook_id
       },
       assign(socket, :access_role, access_role)
       |> assign(:owner_id, owner_id)
       |> assign(:workbook_id, workbook_id)}
    else
      {:error, :forbidden} ->
        {:error, %{reason: "forbidden"}}

      {:error, reason} ->
        {:error, %{reason: reason_to_string(reason)}}
    end
  end

  def join("workbook:", _params, _socket) do
    {:error, %{reason: "invalid_workbook_id"}}
  end

  @impl true
  def handle_in("presence:push", payload, socket) do
    with {:ok, normalized_payload} <- normalize_presence_payload(payload),
         {:ok, peers} <-
           Collaboration.update_peer_presence(
             socket.assigns.workbook_id,
             socket.assigns.identity,
             normalized_payload
           ) do
      broadcast!(socket, "presence", %{peers: serialize_peers(peers)})
      {:reply, {:ok, %{peers: serialize_peers(peers)}}, socket}
    else
      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  @impl true
  def handle_in("snapshot:push", %{"clientId" => client_id, "workbook" => workbook}, socket) do
    if socket.assigns.access_role != "editor" do
      {:reply, {:error, %{reason: "forbidden"}}, socket}
    else
      token = socket.assigns.firebase_token
      identity = socket.assigns.identity

      with {:ok, normalized_workbook} <-
             normalize_snapshot_workbook(workbook, socket.assigns.workbook_id),
           {:ok, snapshot} <-
             Collaboration.replace_base_update(
               socket.assigns.workbook_id,
               normalized_workbook["updateBase64"],
               normalized_workbook["collaborationVersion"],
               identity
             ),
           {:ok, persisted_workbook} <-
             persist_snapshot_workbook(socket, token, normalized_workbook, client_id) do
        broadcast_from!(socket, "snapshot", %{
          update: normalized_workbook["updateBase64"],
          version: snapshot.version
        })

        {:reply,
         {:ok,
          %{
            lastSyncedAt: persisted_workbook.lastSyncedAt,
            version: persisted_workbook.version
          }}, socket}
      else
        {:error, reason} ->
          {:reply, {:error, %{reason: reason_to_string(reason)}}, socket}
      end
    end
  end

  def handle_in("snapshot:push", _payload, socket) do
    {:reply, {:error, %{reason: "payload_required"}}, socket}
  end

  @impl true
  def handle_in("sync:push", %{"update" => update}, socket)
      when socket.assigns.access_role == "editor" do
    with {:ok, normalized_update} <- normalize_update(update),
         {:ok, snapshot} <-
           Collaboration.append_update(
             socket.assigns.workbook_id,
             normalized_update,
             socket.assigns.identity
           ) do
      broadcast_from!(socket, "sync", %{
        update: normalized_update,
        version: snapshot.version
      })

      {:reply, {:ok, %{version: snapshot.version}}, socket}
    else
      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in("sync:push", _payload, socket) do
    reason = if(socket.assigns.access_role == "editor", do: "payload_required", else: "forbidden")
    {:reply, {:error, %{reason: reason}}, socket}
  end

  @impl true
  def handle_in("typing:push", payload, socket) do
    if socket.assigns.access_role != "editor" do
      {:reply, {:error, %{reason: "forbidden"}}, socket}
    else
      with {:ok, normalized_payload} <- normalize_typing_payload(payload),
           {:ok, peers} <-
             Collaboration.update_peer_typing(
               socket.assigns.workbook_id,
               socket.assigns.identity,
               normalized_payload
             ) do
        broadcast!(socket, "presence", %{peers: serialize_peers(peers)})
        {:reply, {:ok, %{peers: serialize_peers(peers)}}, socket}
      else
        {:error, reason} ->
          {:reply, {:error, %{reason: reason}}, socket}
      end
    end
  end

  @impl true
  def terminate(_reason, socket) do
    workbook_id = socket.assigns[:workbook_id]
    identity = socket.assigns[:identity]

    if workbook_id && identity do
      case Collaboration.leave_peer(workbook_id, identity) do
        {:ok, peers} ->
          Endpoint.broadcast("workbook:" <> workbook_id, "presence", %{
            peers: serialize_peers(peers)
          })

        {:error, _reason} ->
          :ok
      end
    end

    :ok
  end

  # Shared editors are allowed to mutate workbook content, but owner-only
  # sharing metadata stays server-authoritative even when they flush snapshots.
  defp persist_snapshot_workbook(socket, token, workbook, client_id) do
    identity = socket.assigns.identity

    if socket.assigns.owner_id == identity.user_id do
      CloudWorkbooks.write_workbook(identity, token, workbook, client_id)
    else
      with {:ok, %{} = owner_workbook} <-
             CloudWorkbooks.read_workbook_as_owner(
               socket.assigns.owner_id,
               token,
               socket.assigns.workbook_id
             ),
           {:ok, sanitized_workbook} <-
             preserve_owner_managed_meta(workbook, owner_workbook),
           {:ok, persisted_workbook} <-
             CloudWorkbooks.write_workbook_as_owner(
               socket.assigns.owner_id,
               token,
               sanitized_workbook,
               client_id
             ) do
        {:ok, persisted_workbook}
      else
        {:ok, nil} -> {:error, :forbidden}
        {:error, reason} -> {:error, reason}
      end
    end
  end

  defp preserve_owner_managed_meta(%{"meta" => next_meta} = workbook, %{"meta" => current_meta})
       when is_map(next_meta) and is_map(current_meta) do
    {:ok,
     workbook
     |> put_in(
       ["meta", "sharingAccessRole"],
       Map.get(current_meta, "sharingAccessRole", Map.get(next_meta, "sharingAccessRole"))
     )
     |> put_in(
       ["meta", "sharingEnabled"],
       Map.get(current_meta, "sharingEnabled", Map.get(next_meta, "sharingEnabled"))
     )}
  end

  defp preserve_owner_managed_meta(_workbook, _current_workbook),
    do: {:error, :invalid_workbook_payload}

  defp maybe_bootstrap_snapshot(workbook_id, workbook, identity) do
    with {:ok, snapshot} <- Collaboration.fetch_snapshot(workbook_id) do
      base_update = get_workbook_value(workbook, :updateBase64)
      version = get_workbook_value(workbook, :version) || 0

      if Snapshot.empty?(snapshot) do
        Collaboration.bootstrap_snapshot(
          workbook_id,
          base_update,
          version,
          identity
        )
      else
        {:ok, snapshot}
      end
    end
  end

  defp normalize_cell(nil), do: {:ok, nil}

  defp normalize_cell(%{"col" => col, "row" => row})
       when is_integer(col) and col >= 0 and is_integer(row) and row >= 0 do
    {:ok, %{"col" => col, "row" => row}}
  end

  defp normalize_cell(_value), do: {:error, "invalid_cell"}

  defp normalize_presence_payload(payload) when is_map(payload) do
    with {:ok, active_cell} <- normalize_cell(Map.get(payload, "activeCell")),
         {:ok, selection} <- normalize_selection(Map.get(payload, "selection")),
         {:ok, sheet_id} <- normalize_optional_string(Map.get(payload, "sheetId")) do
      {:ok,
       %{
         "activeCell" => active_cell,
         "selection" => selection,
         "sheetId" => sheet_id
       }}
    end
  end

  defp normalize_presence_payload(_payload), do: {:error, "invalid_presence_payload"}

  defp normalize_optional_string(nil), do: {:ok, nil}

  defp normalize_optional_string(value) when is_binary(value) and byte_size(value) > 0 do
    {:ok, value}
  end

  defp normalize_optional_string(_value), do: {:error, "invalid_string"}

  defp normalize_selection(nil), do: {:ok, nil}

  defp normalize_selection(%{"end" => selection_end, "mode" => mode, "start" => selection_start})
       when mode in ["cells", "columns", "rows"] do
    with {:ok, normalized_start} <- normalize_cell(selection_start),
         {:ok, normalized_end} <- normalize_cell(selection_end) do
      {:ok,
       %{
         "end" => normalized_end,
         "mode" => mode,
         "start" => normalized_start
       }}
    end
  end

  defp normalize_selection(_value), do: {:error, "invalid_selection"}

  defp normalize_snapshot_workbook(workbook, workbook_id) when is_map(workbook) do
    with update when is_binary(update) and byte_size(update) > 0 <-
           Map.get(workbook, "updateBase64"),
         meta when is_map(meta) <- Map.get(workbook, "meta"),
         ^workbook_id <- Map.get(meta, "id"),
         {:ok, collaboration_version} <-
           normalize_snapshot_version(Map.get(workbook, "collaborationVersion")) do
      {:ok, Map.put(workbook, "collaborationVersion", collaboration_version)}
    else
      _reason -> {:error, :invalid_workbook_payload}
    end
  end

  defp normalize_snapshot_workbook(_workbook, _workbook_id),
    do: {:error, :invalid_workbook_payload}

  defp normalize_snapshot_version(version) when is_integer(version) and version >= 0 do
    {:ok, version}
  end

  defp normalize_snapshot_version(_value), do: {:error, "invalid_snapshot_version"}

  defp normalize_typing_payload(payload) when is_map(payload) do
    typing = Map.get(payload, "typing")

    with {:ok, normalized_typing} <- normalize_typing(typing) do
      {:ok, %{"typing" => normalized_typing}}
    end
  end

  defp normalize_typing_payload(_payload), do: {:error, "invalid_typing_payload"}

  defp normalize_typing(nil), do: {:ok, nil}

  defp normalize_typing(%{"cell" => cell, "draft" => draft, "sheetId" => sheet_id})
       when is_binary(draft) do
    with {:ok, normalized_cell} <- normalize_cell(cell),
         {:ok, normalized_sheet_id} <- normalize_optional_string(sheet_id) do
      if normalized_cell && normalized_sheet_id do
        {:ok,
         %{
           "cell" => normalized_cell,
           "draft" => draft,
           "sheetId" => normalized_sheet_id
         }}
      else
        {:error, "invalid_typing_payload"}
      end
    end
  end

  defp normalize_typing(_value), do: {:error, "invalid_typing_payload"}

  defp normalize_update(update) when is_binary(update) and byte_size(update) > 0 do
    {:ok, update}
  end

  defp normalize_update(_value), do: {:error, "payload_required"}

  defp serialize_peer(peer) do
    %{
      accessRole: peer.access_role,
      activeCell: peer.active_cell,
      deviceId: peer.device_id,
      email: peer.email,
      selection: peer.selection,
      sheetId: peer.sheet_id,
      typing: peer.typing,
      updatedAt: peer.updated_at_ms,
      userId: peer.user_id
    }
  end

  defp serialize_peers(peers) do
    Enum.map(peers, &serialize_peer/1)
  end

  defp get_workbook_value(workbook, key) when is_map(workbook) do
    Map.get(workbook, key) || Map.get(workbook, Atom.to_string(key))
  end

  defp reason_to_string(reason) when is_atom(reason), do: Atom.to_string(reason)
  defp reason_to_string(reason) when is_binary(reason), do: reason
  defp reason_to_string(reason), do: inspect(reason)
end
