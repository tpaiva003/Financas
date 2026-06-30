"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createSpaceAction, type ActionState } from "@/app/(app)/actions";

const initial: ActionState = {};

export function CreateSpaceForm({ creatorName }: { creatorName: string }) {
  const [state, action] = useFormState(createSpaceAction, initial);

  return (
    <form action={action} className="card space-y-4 p-6">
      {state.error ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          {state.error}
        </p>
      ) : null}

      <div>
        <label className="label" htmlFor="name">Nome do ambiente</label>
        <input id="name" name="name" type="text" required placeholder="Ex.: Viagens com a mãe" className="input" />
      </div>

      <div>
        <label className="label" htmlFor="members">Outros participantes (opcional)</label>
        <textarea
          id="members"
          name="members"
          rows={3}
          placeholder="Um nome por linha. Ex.:&#10;Mãe&#10;Irmão"
          className="input resize-none"
        />
        <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
          {creatorName} entra automaticamente. Podes adicionar mais depois.
        </p>
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? "A criar…" : "Criar ambiente"}
    </button>
  );
}
