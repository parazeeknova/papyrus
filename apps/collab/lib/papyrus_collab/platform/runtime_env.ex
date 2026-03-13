defmodule PapyrusCollab.Platform.RuntimeEnv do
  @moduledoc false

  require Logger

  @type warning :: %{
          code: atom(),
          env_name: String.t(),
          message: String.t()
        }

  @spec collect_warnings(keyword()) :: [warning()]
  def collect_warnings(options \\ []) do
    env_name = options[:env_name] || default_env_name()
    firebase_project_id = options[:firebase_project_id] || System.get_env("FIREBASE_PROJECT_ID")
    collab_backup_path = options[:collab_backup_path] || System.get_env("COLLAB_BACKUP_PATH")
    posthog_api_host = options[:posthog_api_host] || System.get_env("POSTHOG_API_HOST")
    posthog_api_key = options[:posthog_api_key] || System.get_env("POSTHOG_API_KEY")

    []
    |> maybe_add_warning(
      is_nil(firebase_project_id) or firebase_project_id == "",
      env_name,
      :missing_firebase_project_id,
      "FIREBASE_PROJECT_ID is not configured; Firebase token verification and Firestore-backed sync will fail in #{env_name}."
    )
    |> maybe_add_warning(
      is_nil(collab_backup_path) or collab_backup_path == "",
      env_name,
      :missing_collab_backup_path,
      "COLLAB_BACKUP_PATH is not configured; the collab service will fall back to a tmp-backed DETS path in #{env_name}."
    )
    |> maybe_add_warning(
      is_nil(posthog_api_key) or posthog_api_key == "",
      env_name,
      :missing_posthog_api_key,
      "POSTHOG_API_KEY is not configured; Phoenix error and log capture will stay local in #{env_name}."
    )
    |> maybe_add_warning(
      partially_configured?(posthog_api_host, posthog_api_key),
      env_name,
      :partial_posthog_configuration,
      "POSTHOG_API_HOST and POSTHOG_API_KEY must be configured together; PostHog reporting is incomplete in #{env_name}."
    )
  end

  @spec report_warnings(keyword()) :: :ok
  def report_warnings(options \\ []) do
    env_name = options[:env_name] || default_env_name()

    if env_name != "test" do
      collect_warnings(options)
      |> Enum.each(fn warning ->
        Logger.warning("[env][#{warning.code}] #{warning.message}")
      end)
    end

    :ok
  end

  defp maybe_add_warning(warnings, true, env_name, code, message) do
    warnings ++ [%{code: code, env_name: env_name, message: message}]
  end

  defp maybe_add_warning(warnings, false, _env_name, _code, _message), do: warnings

  defp default_env_name do
    :papyrus_collab
    |> Application.get_env(:app_env, :prod)
    |> Atom.to_string()
  end

  defp partially_configured?(first, second) do
    present?(first) != present?(second)
  end

  defp present?(value) when is_binary(value), do: String.trim(value) != ""
  defp present?(_value), do: false
end
