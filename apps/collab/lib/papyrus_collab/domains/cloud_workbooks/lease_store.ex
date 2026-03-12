defmodule PapyrusCollab.CloudWorkbooks.LeaseStore do
  @moduledoc false

  use Agent

  @lease_duration_ms 10_000

  @type lease_key :: {String.t(), String.t()}
  @type lease_record :: %{client_id: String.t(), expires_at: non_neg_integer()}

  @spec child_spec(keyword()) :: Supervisor.child_spec()
  def child_spec(opts) do
    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [opts]}
    }
  end

  @spec start_link(keyword()) :: Agent.on_start()
  def start_link(_opts) do
    Agent.start_link(fn -> %{} end, name: __MODULE__)
  end

  @spec acquire(String.t(), String.t(), String.t()) :: boolean()
  def acquire(user_id, workbook_id, client_id)
      when is_binary(user_id) and is_binary(workbook_id) and is_binary(client_id) do
    key = {user_id, workbook_id}
    now = System.system_time(:millisecond)

    Agent.get_and_update(__MODULE__, fn leases ->
      case Map.get(leases, key) do
        %{client_id: ^client_id, expires_at: _expires_at} ->
          {true, Map.put(leases, key, new_lease(client_id, now))}

        %{expires_at: expires_at} when expires_at <= now ->
          {true, Map.put(leases, key, new_lease(client_id, now))}

        nil ->
          {true, Map.put(leases, key, new_lease(client_id, now))}

        _active_lease ->
          {false, leases}
      end
    end)
  end

  @spec release(String.t(), String.t()) :: :ok
  def release(user_id, workbook_id)
      when is_binary(user_id) and is_binary(workbook_id) do
    Agent.update(__MODULE__, &Map.delete(&1, {user_id, workbook_id}))
  end

  @spec reset() :: :ok
  def reset do
    Agent.update(__MODULE__, fn _leases -> %{} end)
  end

  @spec new_lease(String.t(), non_neg_integer()) :: lease_record()
  defp new_lease(client_id, now) do
    %{
      client_id: client_id,
      expires_at: now + @lease_duration_ms
    }
  end
end
