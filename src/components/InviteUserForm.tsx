"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { inviteUserAction, type ActionState } from "@/app/(app)/actions";

const empty: ActionState = {};

/**
 * Convida alguém para experimentar com conta independente. Pode vir
 * pré-preenchido a partir de uma mensagem de contacto.
 */
export function InviteUserForm({
  defaultName = "",
  defaultEmail = "",
  compact = false,
}: {
  defaultName?: string;
  defaultEmail?: string;
  compact?: boolean;
}) {
  const [state, action] = useFormState(inviteUserAction, empty);
  const [open, setOpen] = useState(!compact);

  if (compact && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost text-xs">
        Convidar para experimentar
      </button>
    );
  }

  if (state.ok) {
    return (
      <p className="rounded-xl border border-credit/30 bg-credit/10 px-3 py-2 text-xs text-credit">
        {state.message ?? "Convidado."} A palavra-chave é definida por ele na primeira entrada.
      </p>
    );
  }

  return (
    <form action={action} className={compact ? "rounded-xl border border-hair bg-panel2/40 p-3" : ""}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={defaultName}
          placeholder="Nome"
          className="input sm:flex-1"
          aria-label="Nome"
        />
        <input
          name="email"
          type="email"
          required
          defaultValue={defaultEmail}
          placeholder="email@exemplo.pt"
          className="input sm:flex-1"
          aria-label="Email"
        />
        <InviteButton />
      </div>
      <input
        name="spaceName"
        maxLength={80}
        placeholder="Nome do primeiro ambiente (ex.: Casa), opcional"
        className="input mt-2"
        aria-label="Nome do primeiro ambiente"
      />
      <p className="mt-2 text-xs text-fg-faint">
        Conta independente, com ambiente próprio: a pessoa entra e está sozinha
        lá dentro. Os ambientes dela não aparecem aqui, nem os teus lá. A tua
        conta não aparece em lado nenhum na app dela.
      </p>
      {state.error ? (
        <p role="alert" className="mt-1 text-xs text-debt">{state.error}</p>
      ) : null}
    </form>
  );
}

function InviteButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary shrink-0">
      {pending ? "A convidar…" : "Convidar"}
    </button>
  );
}
