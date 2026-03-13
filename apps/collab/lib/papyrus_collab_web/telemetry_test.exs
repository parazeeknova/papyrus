defmodule PapyrusCollabWeb.TelemetryTest do
  use ExUnit.Case, async: true

  alias PapyrusCollabWeb.Telemetry

  test "exposes the expected phoenix and vm metrics" do
    metric_names =
      Telemetry.metrics()
      |> Enum.map(& &1.name)

    assert [:phoenix, :endpoint, :start, :system_time] in metric_names
    assert [:phoenix, :channel_handled_in, :duration] in metric_names
    assert [:vm, :total_run_queue_lengths, :io] in metric_names
  end
end
