# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :papyrus_collab,
  generators: [timestamp_type: :utc_datetime]

config :papyrus_collab, PapyrusCollab.Auth,
  id_token_verifier: PapyrusCollab.Firebase.IdTokenVerifier

config :papyrus_collab, PapyrusCollab.CloudWorkbooks.Store,
  adapter: PapyrusCollab.CloudWorkbooks.Store.Firestore

config :papyrus_collab, PapyrusCollab.SharedWorkbooks.Store,
  adapter: PapyrusCollab.SharedWorkbooks.Store.Firestore

config :papyrus_collab, PapyrusCollab.Collaboration.AccessPolicy,
  adapter: PapyrusCollab.Collaboration.AccessPolicy.CloudWorkbooks

config :papyrus_collab, PapyrusCollab.Collaboration.BackupStore,
  adapter: PapyrusCollab.Collaboration.BackupStore.Dets

config :papyrus_collab, PapyrusCollab.Firebase.IdTokenVerifier,
  key_source: PapyrusCollab.Firebase.PublicKeys

config :posthog,
  api_host: "https://us.i.posthog.com",
  api_key: "test",
  enable: false,
  enable_error_tracking: true,
  in_app_otp_apps: [:papyrus_collab]

# Configure the endpoint
config :papyrus_collab, PapyrusCollabWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: PapyrusCollabWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: PapyrusCollab.PubSub,
  live_view: [signing_salt: "qMCi+CbA"]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
