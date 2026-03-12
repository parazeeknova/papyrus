defmodule PapyrusCollab.Firebase.IdTokenVerifier do
  @moduledoc false

  @behaviour PapyrusCollab.Auth.TokenVerifier

  @cert_issuer_prefix "https://securetoken.google.com/"
  @supported_algorithms ["RS256"]

  @impl true
  @spec verify(String.t()) :: {:ok, map()} | :error
  def verify(token) when is_binary(token) do
    with {:ok, project_id} <- fetch_project_id(),
         {:ok, header} <- decode_header(token),
         {:ok, kid} <- fetch_kid(header),
         {:ok, jwt} <- verify_signature(token, kid),
         :ok <- validate_claims(jwt.fields, project_id) do
      {:ok, jwt.fields}
    else
      _reason -> :error
    end
  end

  defp decode_header(token) do
    case String.split(token, ".", parts: 3) do
      [encoded_header, _encoded_payload, _signature] ->
        with {:ok, header_json} <- Base.url_decode64(encoded_header, padding: false),
             {:ok, header} <- Jason.decode(header_json) do
          {:ok, header}
        else
          _reason -> :error
        end

      _parts ->
        :error
    end
  end

  defp fetch_kid(%{"alg" => "RS256", "kid" => kid})
       when is_binary(kid) and byte_size(kid) > 0 do
    {:ok, kid}
  end

  defp fetch_kid(_header), do: :error

  defp fetch_project_id do
    case Application.get_env(:papyrus_collab, __MODULE__, [])[:project_id] do
      project_id when is_binary(project_id) and byte_size(project_id) > 0 ->
        {:ok, project_id}

      _missing ->
        :error
    end
  end

  defp validate_claims(claims, project_id) when is_map(claims) do
    current_time = System.system_time(:second)
    expected_issuer = @cert_issuer_prefix <> project_id

    # Firebase publishes X509 certificates for securetoken@system and requires
    # third-party backends to enforce the standard OIDC claims locally.
    with :ok <- ensure_string_claim(claims, "aud", project_id),
         :ok <- ensure_string_claim(claims, "iss", expected_issuer),
         :ok <- ensure_non_empty_string(claims["sub"]),
         :ok <- ensure_past_timestamp(claims["auth_time"], current_time),
         :ok <- ensure_past_timestamp(claims["iat"], current_time),
         :ok <- ensure_future_timestamp(claims["exp"], current_time) do
      :ok
    else
      _reason -> :error
    end
  end

  defp verify_signature(token, kid) do
    with {:ok, key} <- key_source().lookup(kid),
         {true, jwt, _jws} <- JOSE.JWT.verify_strict(key, @supported_algorithms, token) do
      {:ok, jwt}
    else
      _reason -> :error
    end
  end

  defp key_source do
    Application.get_env(:papyrus_collab, __MODULE__, [])[:key_source] ||
      PapyrusCollab.Firebase.PublicKeys
  end

  defp ensure_future_timestamp(value, current_time)
       when is_integer(value) and value > current_time do
    :ok
  end

  defp ensure_future_timestamp(_value, _current_time), do: :error

  defp ensure_non_empty_string(value) when is_binary(value) and byte_size(value) > 0 do
    :ok
  end

  defp ensure_non_empty_string(_value), do: :error

  defp ensure_past_timestamp(value, current_time)
       when is_integer(value) and value <= current_time do
    :ok
  end

  defp ensure_past_timestamp(_value, _current_time), do: :error

  defp ensure_string_claim(claims, key, expected_value) when is_map(claims) do
    case claims[key] do
      ^expected_value -> :ok
      _value -> :error
    end
  end
end
