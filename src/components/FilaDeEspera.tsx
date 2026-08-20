"use client";

/**
 * O formulário da fila de espera: email, consentimento, e mais nada.
 *
 * Aparece na porta fechada do registo (`/login?cheio=1`) e onde a landing o
 * quiser usar — a action é a mesma (`waitlistAction`) e o `source` diz de onde
 * veio, para se perceber o que traz pessoas.
 *
 * A resposta de sucesso é a mesma quer o email seja novo quer já esteja na
 * fila: o formulário não pode servir de oráculo de quem está inscrito.
 */

import { useFormState, useFormStatus } from "react-dom";
import { waitlistAction, type WaitlistState } from "@/app/landing-actions";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-fg px-5 py-2.5 text-sm font-medium text-bg disabled:opacity-60"
    >
      {pending ? "A guardar…" : "Avisem-me"}
    </button>
  );
}

export function FilaDeEspera({ source }: { source: string }) {
  const [state, act] = useFormState<WaitlistState, FormData>(waitlistAction, {});

  if (state.ok) {
    return (
      <p role="status" className="rounded-xl border border-credit/30 bg-credit/10 px-4 py-3 text-sm">
        Ficou guardado. Quando abrir vaga, recebes um convite nesse email, e até
        lá não te escrevemos para mais nada.
      </p>
    );
  }

  return (
    <form action={act} className="space-y-3">
      {/* Honeypot: escondido de pessoas, irresistível para robôs. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <input type="hidden" name="source" value={source} />

      <label className="block text-sm">
        <span className="mb-1 block text-fg-muted">O teu email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="w-full rounded-xl border border-hair2 bg-transparent px-4 py-2.5 text-fg outline-none focus:border-fg-faint"
        />
      </label>

      <label className="flex items-start gap-2 text-xs leading-snug text-fg-muted">
        <input type="checkbox" name="consent" required className="mt-0.5" />
        <span>
          Aceito ser contactado quando houver vaga. Só para isso, sem
          novidades, sem publicidade.
        </span>
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-debt">
          {state.error}
        </p>
      ) : null}

      <Botao />
    </form>
  );
}
