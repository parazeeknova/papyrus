defmodule PapyrusCollab.Platform.Google.ServiceAccount do
  @moduledoc false

  @default_token_uri "https://oauth2.googleapis.com/token"
  @firestore_scope "https://www.googleapis.com/auth/datastore"

  @enforce_keys [:client_email, :private_key, :token_uri]
  defstruct [:client_email, :private_key, :project_id, :token_uri]

  @type t :: %__MODULE__{
          client_email: String.t(),
          private_key: String.t(),
          project_id: String.t() | nil,
          token_uri: String.t()
        }

  @spec build_assertion(t(), integer()) :: {:ok, String.t()} | {:error, term()}
  def build_assertion(%__MODULE__{} = service_account, now_unix_seconds) do
    claims = %{
      "aud" => service_account.token_uri,
      "exp" => now_unix_seconds + 3600,
      "iat" => now_unix_seconds,
      "iss" => service_account.client_email,
      "scope" => @firestore_scope
    }

    with {:ok, signing_key} <- build_signing_key(service_account.private_key) do
      try do
        {_, assertion} =
          JOSE.JWT.sign(signing_key, %{"alg" => "RS256", "typ" => "JWT"}, claims)
          |> JOSE.JWS.compact()

        {:ok, assertion}
      rescue
        _error -> {:error, :invalid_service_account_private_key}
      end
    end
  end

  @spec load(keyword()) :: {:ok, t()} | {:error, term()}
  def load(options \\ []) do
    with {:ok, encoded_credentials} <- load_encoded_credentials(options),
         {:ok, decoded_credentials} <- Jason.decode(encoded_credentials) do
      normalize(decoded_credentials)
    end
  end

  defp build_signing_key(private_key) when is_binary(private_key) do
    {:ok, JOSE.JWK.from_pem(private_key)}
  end

  defp load_encoded_credentials(options) do
    service_account_json =
      options[:service_account_json] ||
        Application.get_env(
          :papyrus_collab,
          PapyrusCollab.Platform.Google.ServiceAccountTokenProvider,
          []
        )[
          :service_account_json
        ]

    service_account_path =
      options[:service_account_path] ||
        Application.get_env(
          :papyrus_collab,
          PapyrusCollab.Platform.Google.ServiceAccountTokenProvider,
          []
        )[
          :service_account_path
        ]

    cond do
      present?(service_account_json) ->
        {:ok, service_account_json}

      present?(service_account_path) ->
        File.read(service_account_path)

      true ->
        {:error, :missing_service_account_credentials}
    end
  end

  defp normalize(%{} = credentials) do
    with {:ok, client_email} <- fetch_required_string(credentials, "client_email"),
         {:ok, private_key} <- fetch_required_string(credentials, "private_key") do
      {:ok,
       %__MODULE__{
         client_email: client_email,
         private_key: String.replace(private_key, "\\n", "\n"),
         project_id: fetch_optional_string(credentials, "project_id"),
         token_uri: fetch_optional_string(credentials, "token_uri") || @default_token_uri
       }}
    end
  end

  defp fetch_optional_string(map, key) when is_map(map) and is_binary(key) do
    case Map.get(map, key) do
      value when is_binary(value) ->
        trimmed_value = String.trim(value)

        if byte_size(trimmed_value) > 0 do
          trimmed_value
        else
          nil
        end

      _value ->
        nil
    end
  end

  defp fetch_required_string(map, key) when is_map(map) and is_binary(key) do
    case fetch_optional_string(map, key) do
      value when is_binary(value) -> {:ok, value}
      nil -> {:error, {:missing_service_account_field, key}}
    end
  end

  defp present?(value) when is_binary(value), do: String.trim(value) != ""
  defp present?(_value), do: false
end
