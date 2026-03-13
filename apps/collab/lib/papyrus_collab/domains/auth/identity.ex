defmodule PapyrusCollab.Auth.Identity do
  @moduledoc false

  @enforce_keys [:device_id, :user_id]
  defstruct authenticated: true, device_id: nil, email: nil, user_id: nil

  @type t :: %__MODULE__{
          authenticated: boolean(),
          device_id: String.t(),
          email: String.t() | nil,
          user_id: String.t()
        }

  @spec from_claims(map()) :: {:ok, t()} | :error
  def from_claims(%{"sub" => user_id} = claims)
      when is_binary(user_id) and byte_size(user_id) > 0 do
    {:ok,
     %__MODULE__{
       authenticated: true,
       device_id: "pending",
       email: Map.get(claims, "email"),
       user_id: user_id
     }}
  end

  @spec from_claims(map()) :: {:ok, t()} | :error
  def from_claims(%{"user_id" => user_id} = claims)
      when is_binary(user_id) and byte_size(user_id) > 0 do
    {:ok,
     %__MODULE__{
       authenticated: true,
       device_id: "pending",
       email: Map.get(claims, "email"),
       user_id: user_id
     }}
  end

  def from_claims(_claims), do: :error

  @spec guest(String.t()) :: t()
  def guest(device_id) when is_binary(device_id) and byte_size(device_id) > 0 do
    %__MODULE__{
      authenticated: false,
      device_id: device_id,
      email: nil,
      user_id: guest_user_id(device_id)
    }
  end

  @spec guest_user_id(String.t()) :: String.t()
  def guest_user_id(device_id) when is_binary(device_id) and byte_size(device_id) > 0 do
    "guest:" <> device_id
  end

  @spec authenticated?(t()) :: boolean()
  def authenticated?(%__MODULE__{} = identity), do: identity.authenticated

  @spec with_device_id(t(), String.t()) :: t()
  def with_device_id(%__MODULE__{} = identity, device_id)
      when is_binary(device_id) and byte_size(device_id) > 0 do
    %{identity | device_id: device_id}
  end
end
