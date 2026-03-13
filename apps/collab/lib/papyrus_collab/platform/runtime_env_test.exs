defmodule PapyrusCollab.Platform.RuntimeEnvTest do
  use ExUnit.Case, async: true

  alias PapyrusCollab.Platform.RuntimeEnv

  test "collects warnings for missing optional and required runtime env vars" do
    warnings =
      RuntimeEnv.collect_warnings(
        env_name: "production",
        firebase_project_id: nil,
        collab_backup_path: nil,
        posthog_api_host: nil,
        posthog_api_key: nil
      )

    assert Enum.any?(warnings, &(&1.code == :missing_firebase_project_id))
    assert Enum.any?(warnings, &(&1.code == :missing_collab_backup_path))
    assert Enum.any?(warnings, &(&1.code == :missing_posthog_api_key))
  end

  test "warns when posthog host is configured without the api key" do
    warnings =
      RuntimeEnv.collect_warnings(
        env_name: "development",
        firebase_project_id: "papyrus-dev",
        collab_backup_path: "/tmp/papyrus-collab/backups.dets",
        posthog_api_host: "https://us.i.posthog.com",
        posthog_api_key: nil
      )

    assert Enum.any?(warnings, &(&1.code == :partial_posthog_configuration))
  end
end
