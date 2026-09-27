"use client";

/**
 * Pedir uma sugestão de símbolo de bolsa para um investimento.
 *
 * Só aparece quando o ativo **não tem símbolo**: com símbolo, sugerir outro só
 * criaria dúvida sobre um campo que já está resolvido.
 *
 * **Continua a ser preciso confirmar, e continua a ser por uma boa razão.** O
 * símbolo decide de que empresa vêm todos os preços daqui para a frente, e um
 * ticker da empresa errada não se denuncia: devolve um número com ar de cotação
 * todos os dias, para sempre.
 *
 * **O que mudou foi o custo de confirmar.** Antes a sugestão era só uma frase e
 * quem concordasse tinha de a copiar à mão para o formulário de outro ecrã — o
 * mesmo trabalho que o botão existia para poupar, e ainda com a possibilidade de
 * enganar uma letra pelo caminho. Agora confirma-se num botão que mostra o
 * símbolo que vai gravar. Verificar deixou de custar mais do que ignorar.
 */

import { useFormState, useFormStatus } from "react-dom";
import {
  applySymbolsAction,
  suggestAssetSymbolAction,
  type ActionState,
  type SuggestSymbolState,
} from "@/app/(app)/actions";

const inicial: SuggestSymbolState = {};
const inicialAplicar: ActionState = {};

function Botao({ label, aDecorrer }: { label: string; aDecorrer: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-secondary text-xs" disabled={pending}>
      {pending ? aDecorrer : label}
    </button>
  );
}

export function SuggestSymbolButton({ assetId }: { assetId: string }) {
  const [state, pedir] = useFormState(suggestAssetSymbolAction, inicial);
  const [aplicado, aplicar] = useFormState(applySymbolsAction, inicialAplicar);
  const p = state.proposal;

  // Depois de gravado, a página revalida e este bloco deixa de ser desenhado
  // (o ativo passa a ter símbolo). Até lá, a confirmação fica à vista.
  if (aplicado.ok) {
    return (
      <p className="rounded-xl border border-credit/30 bg-credit/10 px-3 py-2 text-xs text-fg-muted">
        {aplicado.message}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <form action={pedir}>
        <input type="hidden" name="id" value={assetId} />
        <Botao label={p ? "Sugerir outro" : "Sugerir símbolo"} aDecorrer="A procurar…" />
      </form>

      {state.message ? (
        <p className="rounded-xl border border-hair bg-panel2/40 px-3 py-2 text-xs leading-relaxed text-fg-muted">
          <span className="text-fg">Sugestão:</span> {state.message}
          {p?.lastDate ? (
            <>
              {" "}
              Fecho mais recente na fonte:{" "}
              {new Date(`${p.lastDate}T00:00:00Z`).toLocaleDateString("pt-PT")}.
            </>
          ) : null}
        </p>
      ) : null}

      {p ? (
        <form action={aplicar} className="flex flex-wrap items-center gap-2">
          {/* O par vai como a ação o espera: "id:símbolo". O servidor confronta
              o id com os ativos do ambiente antes de tocar em nada. */}
          <input type="hidden" name="apply" value={`${p.assetId}:${p.symbol}`} />
          <Botao label={`Gravar ${p.symbol} e buscar preço`} aDecorrer="A gravar…" />
          <span className="text-[11px] text-fg-faint">
            Confere que é mesmo esta empresa: o símbolo manda em todos os preços
            daqui para a frente.
          </span>
        </form>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-xs leading-relaxed text-fg-faint">
          {state.error}
        </p>
      ) : null}
      {aplicado.error ? (
        <p role="alert" className="text-xs leading-relaxed text-debt">
          {aplicado.error}
        </p>
      ) : null}
    </div>
  );
}
