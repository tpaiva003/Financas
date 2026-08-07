"use client";

/**
 * Pedir uma sugestão de símbolo de bolsa para um investimento.
 *
 * Só aparece quando o ativo **não tem símbolo**: com símbolo, sugerir outro só
 * criaria dúvida sobre um campo que já está resolvido.
 *
 * A sugestão é escrita por extenso e **não é aplicada**. Quem confirma escreve-a
 * no campo do símbolo. Parece um passo a mais e é de propósito: o símbolo
 * decide de que empresa vêm todos os preços daqui para a frente, e um ticker da
 * empresa errada passa despercebido para sempre porque devolve sempre um número
 * com ar de cotação.
 */

import { useFormState, useFormStatus } from "react-dom";
import { suggestAssetSymbolAction, type ActionState } from "@/app/(app)/actions";

const initial: ActionState = {};

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-secondary text-xs" disabled={pending}>
      {pending ? "A procurar…" : "Sugerir símbolo"}
    </button>
  );
}

export function SuggestSymbolButton({ assetId }: { assetId: string }) {
  const [state, action] = useFormState(suggestAssetSymbolAction, initial);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={assetId} />
      <Botao />
      {state.message ? (
        <p className="rounded-xl border border-hair bg-panel2/40 px-3 py-2 text-xs leading-relaxed text-fg-muted">
          {state.message}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-xs leading-relaxed text-fg-faint">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
