defmodule PapyrusCollab.Collaboration.Snapshot do
  @moduledoc false

  alias PapyrusCollab.Auth.Identity

  @type pending_update :: %{
          update: String.t(),
          version: non_neg_integer()
        }

  @enforce_keys [:pending_updates, :updated_at, :version, :workbook_id]
  defstruct [:base_update, :pending_updates, :updated_at, :updated_by, :version, :workbook_id]

  @type t :: %__MODULE__{
          base_update: String.t() | nil,
          pending_updates: [pending_update()],
          updated_at: DateTime.t(),
          updated_by: String.t() | nil,
          version: non_neg_integer(),
          workbook_id: String.t()
        }

  @spec append_update(t(), String.t(), Identity.t()) :: t()
  def append_update(%__MODULE__{} = snapshot, update, %Identity{} = identity)
      when is_binary(update) and byte_size(update) > 0 do
    next_version = snapshot.version + 1

    %__MODULE__{
      snapshot
      | pending_updates: snapshot.pending_updates ++ [%{update: update, version: next_version}],
        updated_at: DateTime.utc_now(),
        updated_by: identity.user_id,
        version: next_version
    }
  end

  @spec new(String.t(), non_neg_integer()) :: t()
  def new(workbook_id, version \\ 0) when is_binary(workbook_id) and version >= 0 do
    %__MODULE__{
      base_update: nil,
      pending_updates: [],
      updated_at: DateTime.utc_now(),
      updated_by: nil,
      version: version,
      workbook_id: workbook_id
    }
  end

  @spec replace_base_update(t(), String.t(), non_neg_integer(), Identity.t()) :: t()
  def replace_base_update(
        %__MODULE__{} = snapshot,
        base_update,
        flushed_version,
        %Identity{} = identity
      )
      when is_binary(base_update) and byte_size(base_update) > 0 and is_integer(flushed_version) and
             flushed_version >= 0 do
    %__MODULE__{
      snapshot
      | base_update: base_update,
        pending_updates: Enum.reject(snapshot.pending_updates, &(&1.version <= flushed_version)),
        updated_at: DateTime.utc_now(),
        updated_by: identity.user_id
    }
  end

  @spec empty?(t()) :: boolean()
  def empty?(%__MODULE__{} = snapshot) do
    is_nil(snapshot.base_update) && snapshot.pending_updates == []
  end
end
