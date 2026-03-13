defmodule PapyrusCollab.ApplicationTest do
  use ExUnit.Case, async: true

  test "forwards endpoint config changes" do
    assert :ok = PapyrusCollab.Application.config_change(%{}, %{}, [])
  end
end
