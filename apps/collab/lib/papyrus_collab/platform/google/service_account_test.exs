defmodule PapyrusCollab.Platform.Google.ServiceAccountTest do
  use ExUnit.Case, async: true

  alias PapyrusCollab.Platform.Google.ServiceAccount

  @private_key """
  -----BEGIN PRIVATE KEY-----
  MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGBAKQuWDs/5uNa45XW
  ZmIBZODEdSX7iEFWF/AvYcdeBebGAx4ir808wKoGet78HUUH2ZN58ReSbA+ohyiI
  2N3otDaWpdHUeCRc4dfPDSBWXw70VpGAelrbBb785bZezYRQxwf2JIIE39cN5BSP
  dbilwCYnHdsJV/L9j+JDSIx0/kGvAgMBAAECgYAEZs2swPjSrZQeZ0IVbI4kzH+L
  hiPQBJvdr5eCfc3QswxQWYO3D+LmbAgNRFsQh7ZYktNY228UOGNvPcP6pwt1xDG0
  DXwn23xmAe5zR02jogr4Bwq8M94Oly5F8a/7XfdU0UNW2O0YV655MrWJFZ1VXQqW
  aWJ2/WqSJU0w/gaMwQJBANWNhknrxSmhmV6BODITHHseetKubgqmEi1la8kX1DPV
  Q7XX7krPCYBsv7KX6i4AeYM1gDqARRfjRAVAk72XEs8CQQDE0JLDMkcQ0+os36fG
  6cCwf55TpBzO4P4UAFiT+NlaxDFxFja6zXL1O8GtHVzxftb8NfLHuJcKBK++yIxI
  JxshAkBMm4ZvAisqchQouMZGAGEZMafx6C0FmOmwa0+tReUT6w9tLlcHcxn/fgOO
  t7yEYBs3HHwxgE5I8Xg3QiE9w/I1AkAcOF/i1zGzav9X4dXXwqqbZCEakxyCWWZ1
  Dbuls/fOePUx5uKAFHdYTHIv1Vb/VZWT4lRmaMRXbmaYr37V1a2hAkEAlabWSY+H
  OIB6Un2zpW4xvHPYm6fEw7V2BAEfvyLLVDdpZgKa7R4GqWB3eNyL+KGsZtt+My0S
  2ymh4BzCGZuhEA==
  -----END PRIVATE KEY-----
  """

  test "loads inline service account json and normalizes escaped newlines" do
    assert {:ok, service_account} =
             ServiceAccount.load(
               service_account_json:
                 Jason.encode!(%{
                   "client_email" => "papyrus-collab@example.com",
                   "private_key" => String.replace(@private_key, "\n", "\\n"),
                   "project_id" => "papyrus-test",
                   "token_uri" => "https://oauth2.googleapis.com/token"
                 })
             )

    assert service_account.client_email == "papyrus-collab@example.com"
    assert service_account.project_id == "papyrus-test"
    assert String.contains?(service_account.private_key, "\n")
  end

  test "builds a signed service account assertion for firestore access" do
    assert {:ok, service_account} =
             ServiceAccount.load(
               service_account_json:
                 Jason.encode!(%{
                   "client_email" => "papyrus-collab@example.com",
                   "private_key" => @private_key,
                   "project_id" => "papyrus-test",
                   "token_uri" => "https://oauth2.googleapis.com/token"
                 })
             )

    assert {:ok, assertion} = ServiceAccount.build_assertion(service_account, 1_700_000_000)

    signing_key = JOSE.JWK.from_pem(@private_key)

    assert {true, jwt, _jws} = JOSE.JWT.verify_strict(signing_key, ["RS256"], assertion)
    assert jwt.fields["iss"] == service_account.client_email
    assert jwt.fields["aud"] == service_account.token_uri
    assert jwt.fields["scope"] == "https://www.googleapis.com/auth/datastore"
    assert jwt.fields["iat"] == 1_700_000_000
    assert jwt.fields["exp"] == 1_700_003_600
  end
end
