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
    env_values = build_env_values(options)

    warning_specs(env_name, env_values)
    |> Enum.reduce([], fn {condition, code, message}, warnings ->
      maybe_add_warning(warnings, condition, env_name, code, message)
    end)
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

  defp build_env_values(options) do
    %{
      collab_backup_path: options[:collab_backup_path] || System.get_env("COLLAB_BACKUP_PATH"),
      firebase_project_id: options[:firebase_project_id] || System.get_env("FIREBASE_PROJECT_ID"),
      google_application_credentials:
        options[:google_application_credentials] ||
          System.get_env("GOOGLE_APPLICATION_CREDENTIALS"),
      google_service_account_json:
        options[:google_service_account_json] || System.get_env("GOOGLE_SERVICE_ACCOUNT_JSON"),
      posthog_api_host: options[:posthog_api_host] || System.get_env("POSTHOG_API_HOST"),
      posthog_api_key: options[:posthog_api_key] || System.get_env("POSTHOG_API_KEY")
    }
  end

  defp default_env_name do
    :papyrus_collab
    |> Application.get_env(:app_env, :prod)
    |> Atom.to_string()
  end

  defp partially_configured?(first, second) do
    present?(first) != present?(second)
  end

  defp warning_specs(env_name, env_values) do
    [
      {
        missing?(env_values.firebase_project_id),
        :missing_firebase_project_id,
        "FIREBASE_PROJECT_ID is not configured; Firebase token verification and Firestore-backed sync will fail in #{env_name}."
      },
      {
        missing?(env_values.collab_backup_path),
        :missing_collab_backup_path,
        "COLLAB_BACKUP_PATH is not configured; the collab service will fall back to a tmp-backed DETS path in #{env_name}."
      },
      {
        !(present?(env_values.google_application_credentials) ||
            present?(env_values.google_service_account_json)),
        :missing_google_service_account_credentials,
        "GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON must be configured; Phoenix cannot use server-owned Firestore credentials in #{env_name}."
      },
      {
        missing?(env_values.posthog_api_key),
        :missing_posthog_api_key,
        "POSTHOG_API_KEY is not configured; Phoenix error and log capture will stay local in #{env_name}."
      },
      {
        partially_configured?(env_values.posthog_api_host, env_values.posthog_api_key),
        :partial_posthog_configuration,
        "POSTHOG_API_HOST and POSTHOG_API_KEY must be configured together; PostHog reporting is incomplete in #{env_name}."
      }
    ]
  end

  defp missing?(value) when is_binary(value), do: String.trim(value) == ""
  defp missing?(nil), do: true
  defp missing?(_value), do: false

  defp present?(value) when is_binary(value), do: String.trim(value) != ""
  defp present?(_value), do: false
end
