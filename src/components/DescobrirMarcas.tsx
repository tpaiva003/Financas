"use client";

/**
 * Pôr logo nos investimentos que ainda não têm marca.
 *
 * **Aplica sem pedir confirmação, ao contrário do símbolo.** A diferença é o
 * que está em jogo: um símbolo errado devolve um preço plausível todos os dias,
 * para sempre, e ninguém desconfia; um logo errado vê-se logo e desfaz-se. Pedir
 * confirmação uma a uma para uma coisa decorativa era fazer trabalho por nada.
 *
 * **Diz sempre quantos ficaram de fora.** Metade dos ETF e tudo o que não é
 * marca conhecida não tem logo utilizável — esses ficam com as iniciais, que é
 * o que já tinham, e não é uma avaria.
 */

import { useFormState, useFormStatus } from "react-dom";
import { descobrirMarcasAction, type ActionState } from "@/app/(app)/actions";

const vazio: ActionState = {};

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-ghost h-9 px-3 text-xs" disabled={pending}>
      {pending ? "A procurar…" : "Pôr logos"}
    </button>
  );
}

export function DescobrirMarcas() {
  const [state, descobrir] = useFormState(descobrirMarcasAction, vazio);
  return (
    <form action={descobrir} className="flex flex-wrap items-center gap-2">
      <Botao />
      {state.ok ? <span className="text-xs text-fg-faint">{state.message}</span> : null}
      {state.error ? (
        <span role="alert" className="text-xs text-debt">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
