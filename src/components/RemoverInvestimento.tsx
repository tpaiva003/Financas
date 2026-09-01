"use client";

/**
 * Apagar um investimento inteiro, da ficha dele.
 *
 * **Porque é que isto existe.** Os investimentos são desenhados em cartões, e o
 * cartão não tem "Remover"; a ficha só tinha o "Remover" de cada movimento. Um
 * investimento criado por engano — sem movimentos nenhuns, que é como fica
 * quem se enganou a registar — não se conseguia apagar em lado nenhum.
 *
 * **Dois passos, e a dizer o que leva atrás.** Não tem volta, e o que
 * desaparece com ele (movimentos, desdobramentos, documentos) não está à vista
 * de quem carrega. Um botão que apaga sem dizer o que apaga só se percebe
 * depois.
 *
 * Fica no fim da página, longe do resto: o que destrói não se põe ao lado do
 * que se usa todos os dias.
 */

import { useFormState, useFormStatus } from "react-dom";
import { removerInvestimentoAction, type ActionState } from "@/app/(app)/actions";

const vazio: ActionState = {};

function Apagar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-secondary text-xs text-debt" disabled={pending}>
      {pending ? "A apagar…" : "Sim, apagar"}
    </button>
  );
}

export function RemoverInvestimento({
  id,
  nome,
  movimentos,
  documentos,
}: {
  id: string;
  nome: string;
  /** Quantos movimentos vão atrás. */
  movimentos: number;
  /** Quantos documentos vão atrás. */
  documentos: number;
}) {
  const [state, remover] = useFormState(removerInvestimentoAction, vazio);

  const leva = [
    movimentos > 0 ? `${movimentos} ${movimentos === 1 ? "movimento" : "movimentos"}` : null,
    documentos > 0 ? `${documentos} ${documentos === 1 ? "documento" : "documentos"}` : null,
  ].filter(Boolean);

  return (
    <details className="card p-5">
      <summary className="cursor-pointer text-sm text-fg-muted hover:text-fg">
        Apagar este investimento
      </summary>

      <p className="mt-3 text-xs leading-snug text-fg-muted">
        Apaga <span className="font-medium text-fg">{nome}</span> da carteira
        {leva.length > 0 ? `, e com ele ${leva.join(" e ")}` : ", que não tem movimentos registados"}.
        Não tem volta.
      </p>
      <p className="mt-1 text-xs leading-snug text-fg-faint">
        Se o que queres é dizer que já não tens esta posição, regista antes a
        venda: assim o histórico e a mais-valia ficam, que é o que interessa
        quando chegar a altura de os declarar.
      </p>

      <form action={remover} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <Apagar />
        {state.error ? (
          <span role="alert" className="text-[11px] text-debt">
            {state.error}
          </span>
        ) : null}
      </form>
    </details>
  );
}
