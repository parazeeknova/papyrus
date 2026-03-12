defmodule PapyrusCollab.Collaboration.Snapshot do
  @moduledoc false

  alias PapyrusCollab.Auth.Identity

  @enforce_keys [:payload, :updated_at, :version, :workbook_id]
  defstruct [:payload, :updated_at, :updated_by, :version, :workbook_id]

  @type payload :: term()

  @type t :: %__MODULE__{
          payload: payload(),
          updated_at: DateTime.t(),
          updated_by: String.t() | nil,
          version: non_neg_integer(),
          workbook_id: String.t()
        }

  @spec apply_update(t(), payload(), Identity.t()) :: t()
  def apply_update(%__MODULE__{} = snapshot, payload, %Identity{} = identity) do
    %__MODULE__{
      snapshot
      | payload: payload,
        updated_at: DateTime.utc_now(),
        updated_by: identity.user_id,
        version: snapshot.version + 1
    }
  end

  @spec new(String.t()) :: t()
  def new(workbook_id) when is_binary(workbook_id) do
    %__MODULE__{
      payload: nil,
      updated_at: DateTime.utc_now(),
      updated_by: nil,
      version: 0,
      workbook_id: workbook_id
    }
  end
end
