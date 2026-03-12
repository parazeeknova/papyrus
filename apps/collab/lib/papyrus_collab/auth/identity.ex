defmodule PapyrusCollab.Auth.Identity do
  @moduledoc false

  @enforce_keys [:device_id, :user_id]
  defstruct [:device_id, :email, :user_id]

  @type t :: %__MODULE__{
          device_id: String.t(),
          email: String.t() | nil,
          user_id: String.t()
        }

  @spec from_claims(map()) :: {:ok, t()} | :error
  def from_claims(%{"sub" => user_id} = claims)
      when is_binary(user_id) and byte_size(user_id) > 0 do
    {:ok,
     %__MODULE__{
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
       device_id: "pending",
       email: Map.get(claims, "email"),
       user_id: user_id
     }}
  end

  def from_claims(_claims), do: :error

  @spec with_device_id(t(), String.t()) :: t()
  def with_device_id(%__MODULE__{} = identity, device_id)
      when is_binary(device_id) and byte_size(device_id) > 0 do
    %{identity | device_id: device_id}
  end
end
