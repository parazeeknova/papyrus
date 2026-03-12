defmodule PapyrusCollabWeb.ChannelCase do
  @moduledoc false

  use ExUnit.CaseTemplate

  using do
    quote do
      @endpoint PapyrusCollabWeb.Endpoint

      import Phoenix.ChannelTest
      import PapyrusCollabWeb.ChannelCase
    end
  end

  setup _tags do
    PapyrusCollab.Collaboration.reset_backup_store()
    PapyrusCollab.CloudWorkbooks.reset()
    :ok
  end

  @spec socket_params(String.t(), String.t(), String.t() | nil) :: map()
  def socket_params(user_id, device_id, email \\ nil) do
    identity = %PapyrusCollab.Auth.Identity{
      device_id: device_id,
      email: email,
      user_id: user_id
    }

    %{
      "device_id" => device_id,
      "token" => PapyrusCollab.Auth.sign_socket_token(identity)
    }
  end

  @spec unique_workbook_id() :: String.t()
  def unique_workbook_id do
    "workbook-" <> Integer.to_string(System.unique_integer([:positive]))
  end
end
