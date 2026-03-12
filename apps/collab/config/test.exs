import Config

# We don't run a server during test. If one is required,
# you can enable the server option below.
config :papyrus_collab, PapyrusCollabWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "0k11Vxx557zAO3uicW6ixKNPWNaDDkz5QHt/xfB063GG8gyJ4HlMVFP8N88vGwLd",
  server: false

config :papyrus_collab, PapyrusCollab.Auth,
  id_token_verifier: PapyrusCollab.Auth.TestTokenVerifier

config :papyrus_collab, PapyrusCollab.CloudWorkbooks.Store,
  adapter: PapyrusCollab.CloudWorkbooks.Store.InMemory

config :papyrus_collab, PapyrusCollab.SharedWorkbooks.Store,
  adapter: PapyrusCollab.SharedWorkbooks.Store.InMemory

config :posthog,
  api_key: "test",
  enable: true,
  test_mode: true

# Print only warnings and errors during test
config :logger, level: :warning

# Initialize plugs at runtime for faster test compilation
config :phoenix, :plug_init_mode, :runtime

# Sort query params output of verified routes for robust url comparisons
config :phoenix,
  sort_verified_routes_query_params: true
