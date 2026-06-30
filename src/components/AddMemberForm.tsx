"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { addMemberAction, type ActionState } from "@/app/(app)/actions";

const initial: ActionState = {};

export function AddMemberForm({ spaceId }: { spaceId: string }) {
  const [state, action] = useFormState(addMemberAction, initial);
  const ref = useRef<HTMLFormElement>(null);
  const [grant, setGrant] = useState(false);

  // Limpa o formulário só depois de adicionar com sucesso.
  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setGrant(false);
    }
  }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-3">
      {state.error ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          {state.error}
        </p>
      ) : null}
      <input type="hidden" name="spaceId" value={spaceId} />

      <div>
        <label className="label" htmlFor="m-name">Nome</label>
        <input id="m-name" name="name" type="text" required placeholder="Ex.: Mãe" className="input" />
      </div>

      {!grant ? (
        <div>
          <label className="label" htmlFor="m-email">Email (opcional)</label>
          <input id="m-email" name="email" type="email" placeholder="opcional" className="input" />
        </div>
      ) : null}

      <label className="flex items-center gap-3 text-sm text-fg-muted">
        <input
          type="checkbox"
          name="grantSubmit"
          checked={grant}
          onChange={(e) => setGrant(e.target.checked)}
          className="h-4 w-4 rounded border-hair bg-panel2 accent-fg"
        />
        Dar acesso para <span className="text-fg">submeter despesas</span> (com aprovação)
      </label>

      {grant ? (
        <div className="rounded-xl border border-hair bg-panel2/40 p-3">
          <label className="label" htmlFor="m-access-email">Email de acesso</label>
          <input
            id="m-access-email"
            name="accessEmail"
            type="email"
            required
            placeholder="email@exemplo.pt"
            className="input"
          />
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.04em] text-fg-faint">
            Entra com este email · só submete despesas (pagador e divisão entre os membros plenos)
          </p>
        </div>
      ) : null}

      <SubmitButton grant={grant} />
    </form>
  );
}

function SubmitButton({ grant }: { grant: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending
        ? "A adicionar…"
        : grant
          ? "Adicionar com acesso de submissão"
          : "Adicionar participante"}
    </button>
  );
}
