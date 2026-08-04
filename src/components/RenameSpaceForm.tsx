"use client";

import { useFormState, useFormStatus } from "react-dom";
import { renameSpaceAction, type ActionState } from "@/app/(app)/actions";

const empty: ActionState = {};

export function RenameSpaceForm({ currentName }: { currentName: string }) {
  const [state, action] = useFormState(renameSpaceAction, empty);

  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="label" htmlFor="space-name">Nome do ambiente</label>
        <input
          id="space-name"
          name="name"
          required
          maxLength={80}
          defaultValue={currentName}
          className="input"
        />
      </div>
      <SaveButton />
      {state.error ? (
        <p role="alert" className="text-xs text-debt sm:self-center">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p className="text-xs text-credit sm:self-center">Nome atualizado.</p>
      ) : null}
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-secondary shrink-0">
      {pending ? "A guardar…" : "Guardar nome"}
    </button>
  );
}
