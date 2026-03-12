defmodule PapyrusCollab.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  alias PapyrusCollab.{CloudWorkbooks.Store, SharedWorkbooks}

  @impl true
  def start(_type, _args) do
    children =
      [
        PapyrusCollabWeb.Telemetry,
        {DNSCluster, query: Application.get_env(:papyrus_collab, :dns_cluster_query) || :ignore},
        {Phoenix.PubSub, name: PapyrusCollab.PubSub},
        PapyrusCollabWeb.Presence,
        {Registry, keys: :unique, name: PapyrusCollab.Collaboration.RoomRegistry},
        PapyrusCollab.CloudWorkbooks.LeaseStore,
        cloud_workbook_store_child(),
        shared_workbook_store_child(),
        PapyrusCollab.Collaboration.BackupStore,
        PapyrusCollab.Collaboration.RoomSupervisor,
        PapyrusCollab.Firebase.PublicKeys,
        # Start a worker by calling: PapyrusCollab.Worker.start_link(arg)
        # {PapyrusCollab.Worker, arg},
        # Start to serve requests, typically the last entry
        PapyrusCollabWeb.Endpoint
      ]
      |> Enum.reject(&is_nil/1)

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: PapyrusCollab.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    PapyrusCollabWeb.Endpoint.config_change(changed, removed)
    :ok
  end

  defp cloud_workbook_store_child do
    adapter = Store.adapter()

    if Code.ensure_loaded?(adapter) and function_exported?(adapter, :child_spec, 1) do
      {adapter, []}
    else
      nil
    end
  end

  defp shared_workbook_store_child do
    adapter = SharedWorkbooks.Store.adapter()

    if Code.ensure_loaded?(adapter) and function_exported?(adapter, :child_spec, 1) do
      {adapter, []}
    else
      nil
    end
  end
end
