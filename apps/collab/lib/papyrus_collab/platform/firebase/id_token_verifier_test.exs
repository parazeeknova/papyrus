defmodule PapyrusCollab.Firebase.IdTokenVerifierTest do
  use ExUnit.Case, async: true

  alias PapyrusCollab.Firebase.{IdTokenVerifier, TestPublicKeys}

  setup do
    previous_config =
      Application.get_env(:papyrus_collab, PapyrusCollab.Firebase.IdTokenVerifier, [])

    Application.put_env(
      :papyrus_collab,
      PapyrusCollab.Firebase.IdTokenVerifier,
      key_source: TestPublicKeys,
      project_id: "papyrus-test"
    )

    on_exit(fn ->
      Application.put_env(
        :papyrus_collab,
        PapyrusCollab.Firebase.IdTokenVerifier,
        previous_config
      )
    end)

    :ok
  end

  test "verifies a firebase-compatible id token with the configured project id" do
    key = JOSE.JWK.generate_key({:rsa, 2_048, 65_537})
    claims = build_claims("papyrus-test")
    token = sign_token(key, claims, "kid-valid")

    TestPublicKeys.put_key("kid-valid", key)

    assert {:ok, verified_claims} = IdTokenVerifier.verify(token)
    assert verified_claims["sub"] == claims["sub"]
    assert verified_claims["aud"] == "papyrus-test"
  end

  test "rejects an id token with the wrong firebase project id" do
    key = JOSE.JWK.generate_key({:rsa, 2_048, 65_537})
    claims = build_claims("wrong-project")
    token = sign_token(key, claims, "kid-invalid")

    TestPublicKeys.put_key("kid-invalid", key)

    assert :error = IdTokenVerifier.verify(token)
  end

  defp build_claims(project_id) do
    current_time = System.system_time(:second)

    %{
      "aud" => project_id,
      "auth_time" => current_time - 60,
      "exp" => current_time + 3_600,
      "iat" => current_time - 60,
      "iss" => "https://securetoken.google.com/#{project_id}",
      "sub" => "firebase-user-1"
    }
  end

  defp sign_token(key, claims, kid) do
    {_, token} =
      JOSE.JWT.sign(key, %{"alg" => "RS256", "kid" => kid}, claims)
      |> JOSE.JWS.compact()

    token
  end
end
