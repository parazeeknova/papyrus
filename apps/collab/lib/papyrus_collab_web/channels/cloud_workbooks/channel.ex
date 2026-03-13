defmodule PapyrusCollabWeb.CloudWorkbookChannel do
  @moduledoc false

  use PapyrusCollabWeb, :channel

  require Logger

  alias PapyrusCollab.Auth.Identity
  alias PapyrusCollab.CloudWorkbooks

  @impl true
  def join("cloud_workbooks", _params, socket) do
    if Identity.authenticated?(socket.assigns.identity) do
      {:ok, socket}
    else
      {:error, %{reason: "authentication_required"}}
    end
  end

  @impl true
  def handle_in("acquire_lease", %{"clientId" => client_id, "workbookId" => workbook_id}, socket) do
    case CloudWorkbooks.acquire_lease(socket.assigns.identity, workbook_id, client_id) do
      {:ok, has_lease} ->
        {:reply, {:ok, %{hasLease: has_lease}}, socket}

      {:error, reason} ->
        reply_error("acquire_lease", reason, socket)
    end
  end

  def handle_in("delete", %{"workbookId" => workbook_id}, socket) do
    case CloudWorkbooks.delete_workbook(socket.assigns.identity, workbook_id) do
      :ok ->
        {:reply, {:ok, %{deleted: true}}, socket}

      {:error, reason} ->
        reply_error("delete", reason, socket)
    end
  end

  def handle_in("list", _payload, socket) do
    case CloudWorkbooks.list_workbooks(socket.assigns.identity) do
      {:ok, workbooks} ->
        {:reply, {:ok, %{workbooks: workbooks}}, socket}

      {:error, reason} ->
        reply_error("list", reason, socket)
    end
  end

  def handle_in("read", %{"workbookId" => workbook_id}, socket) do
    case CloudWorkbooks.read_workbook(socket.assigns.identity, workbook_id) do
      {:ok, workbook} ->
        {:reply, {:ok, %{workbook: workbook}}, socket}

      {:error, reason} ->
        reply_error("read", reason, socket)
    end
  end

  def handle_in("write", %{"clientId" => client_id, "workbook" => workbook}, socket) do
    case CloudWorkbooks.write_workbook(socket.assigns.identity, workbook, client_id) do
      {:ok, result} ->
        {:reply, {:ok, result}, socket}

      {:error, reason} ->
        reply_error("write", reason, socket)
    end
  end

  def handle_in(_event, _payload, socket) do
    {:reply, {:error, %{reason: "unsupported_event"}}, socket}
  end

  defp reply_error(event_name, reason, socket) do
    user_id = socket.assigns.identity.user_id
    reason_code = reason_to_string(reason)

    Logger.error(
      "Cloud workbook request #{event_name} failed for #{user_id}: #{inspect(reason)} (code=#{reason_code})"
    )

    {:reply, {:error, %{reason: reason_code}}, socket}
  end

  defp reason_to_string({:firestore_http, status, _body}), do: "firestore_http_#{status}"

  defp reason_to_string({:missing_service_account_field, field}),
    do: "missing_service_account_field_#{field}"

  defp reason_to_string({:token_exchange_http, status, _body}),
    do: "token_exchange_http_#{status}"

  defp reason_to_string(reason) when is_atom(reason), do: Atom.to_string(reason)
  defp reason_to_string(reason) when is_binary(reason), do: reason
  defp reason_to_string(_reason), do: "cloud_workbooks_unavailable"
end
