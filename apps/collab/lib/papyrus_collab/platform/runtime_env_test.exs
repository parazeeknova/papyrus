defmodule PapyrusCollab.Platform.RuntimeEnvTest do
  use ExUnit.Case, async: false
  import ExUnit.CaptureLog

  alias PapyrusCollab.Platform.RuntimeEnv

  test "collects warnings for missing optional and required runtime env vars" do
    warnings =
      RuntimeEnv.collect_warnings(
        env_name: "production",
        firebase_project_id: nil,
        google_application_credentials: nil,
        google_service_account_json: nil,
        collab_backup_path: nil,
        posthog_api_host: nil,
        posthog_api_key: nil
      )

    assert Enum.any?(warnings, &(&1.code == :missing_firebase_project_id))
    assert Enum.any?(warnings, &(&1.code == :missing_google_service_account_credentials))
    assert Enum.any?(warnings, &(&1.code == :missing_collab_backup_path))
    assert Enum.any?(warnings, &(&1.code == :missing_posthog_api_key))
  end

  test "warns when posthog host is configured without the api key" do
    warnings =
      RuntimeEnv.collect_warnings(
        env_name: "development",
        firebase_project_id: "papyrus-dev",
        google_application_credentials: "/tmp/service-account.json",
        google_service_account_json: nil,
        collab_backup_path: "/tmp/papyrus-collab/backups.dets",
        posthog_api_host: "https://us.i.posthog.com",
        posthog_api_key: nil
      )

    assert Enum.any?(warnings, &(&1.code == :partial_posthog_configuration))
  end

  test "reports warnings outside test env and skips logger output in test env" do
    log =
      capture_log(fn ->
        assert :ok =
                 RuntimeEnv.report_warnings(
                   env_name: "development",
                   firebase_project_id: nil,
                   google_application_credentials: nil,
                   google_service_account_json: nil,
                   collab_backup_path: nil,
                   posthog_api_host: nil,
                   posthog_api_key: nil
                 )
      end)

    assert log =~ "missing_firebase_project_id"
    assert :ok = RuntimeEnv.report_warnings(env_name: "test")
  end

  test "uses default env resolution and treats non-string values as present" do
    previous_app_env = Application.get_env(:papyrus_collab, :app_env)

    Application.put_env(:papyrus_collab, :app_env, :dev)

    warnings =
      RuntimeEnv.collect_warnings(
        firebase_project_id: "papyrus-dev",
        google_application_credentials: 123,
        google_service_account_json: nil,
        collab_backup_path: :configured,
        posthog_api_host: nil,
        posthog_api_key: nil
      )

    assert Enum.any?(warnings, &(&1.env_name == "dev"))
    refute Enum.any?(warnings, &(&1.code == :missing_collab_backup_path))

    if is_nil(previous_app_env) do
      Application.delete_env(:papyrus_collab, :app_env)
    else
      Application.put_env(:papyrus_collab, :app_env, previous_app_env)
    end
  end

  test "collects warnings when invoked without explicit options" do
    assert is_list(RuntimeEnv.collect_warnings())
  end
end
