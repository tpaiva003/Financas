"use client";

import { useFormState, useFormStatus } from "react-dom";
import { refreshAllQuotesAction } from "@/app/(app)/actions";
import type { ActionState } from "@/app/(app)/actions";

const vazio: ActionState = {};

/**
 * Ir buscar a cotação de todos os investimentos de uma vez.
 *
 * Com uma posição o botão de cada linha chega; com dezenas, não — ninguém carrega
 * cinquenta vezes. E diz sempre o que aconteceu: quantos mudaram, quantos já
 * estavam em dia, e **quais falharam e porquê**. Um botão que responde "feito"
 * quando metade falhou deixa a pessoa a olhar para números velhos convencida de
 * que são novos.
 */
function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-ghost gap-1.5 px-2 text-xs">
      {/* Duas setas em círculo: o símbolo de "voltar a buscar" que toda a gente
          já conhece de outras apps. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 8a6 6 0 1 1-1.76-4.24" />
        <path d="M14 2v4h-4" />
      </svg>
      {pending ? "A atualizar…" : "Atualizar preços"}
    </button>
  );
}

export function RefreshQuotesButton() {
  const [state, action] = useFormState(refreshAllQuotesAction, vazio);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={action}>
        <Botao />
      </form>
      {state.message ? (
        <p className="text-xs text-fg-muted" role="status">
          {state.message}
        </p>
      ) : null}
      {state.error ? (
        <p className="max-w-xs text-right text-xs text-debt" role="status">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
