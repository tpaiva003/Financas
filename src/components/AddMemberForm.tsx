"use client";

import { useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { addMemberAction, type ActionState } from "@/app/(app)/actions";

const initial: ActionState = {};

export function AddMemberForm({ spaceId }: { spaceId: string }) {
  const [state, action] = useFormState(addMemberAction, initial);
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={async (fd) => {
        await action(fd);
        ref.current?.reset();
      }}
      className="space-y-3"
    >
      {state.error ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          {state.error}
        </p>
      ) : null}
      <input type="hidden" name="spaceId" value={spaceId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="m-name">Nome</label>
          <input id="m-name" name="name" type="text" required placeholder="Ex.: Mãe" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="m-email">Email (opcional)</label>
          <input id="m-email" name="email" type="email" placeholder="opcional" className="input" />
        </div>
      </div>
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? "A adicionar…" : "Adicionar participante"}
    </button>
  );
}
