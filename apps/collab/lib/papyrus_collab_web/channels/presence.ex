defmodule PapyrusCollabWeb.Presence do
  @moduledoc false

  use Phoenix.Presence,
    otp_app: :papyrus_collab,
    pubsub_server: PapyrusCollab.PubSub
end
