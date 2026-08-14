"use client";

/**
 * Sugerir de uma vez os símbolos de todos os investimentos que não têm nenhum.
 *
 * **Porquê, ao lado do botão de cada ficha.** Uma importação de corretora cria
 * dezenas de ativos ao mesmo tempo, todos sem símbolo — e sem símbolo não há
 * cotação, nem preço atual, nem ganho, nem rentabilidade. Abrir quarenta fichas
 * para carregar quarenta vezes no mesmo botão não é trabalho que se peça a
 * ninguém, e o que acontece na prática é a carteira ficar por atualizar.
 *
 * **Escolhe-se um a um.** Vem tudo marcado, porque quase sempre está certo, mas
 * cada linha diz o ticker, a praça, a moeda e porque é que o modelo acha que é
 * aquele — e desmarca-se o que não for. Um ticker que existe mas é de outra
 * empresa passa na verificação contra a fonte de cotações e devolve um preço
 * plausível todos os dias, para sempre. Ninguém desconfia de um número com ar de
 * cotação, e é por isso que a última palavra não é do modelo.
 */

import { useFormState, useFormStatus } from "react-dom";
import {
  applySymbolsAction,
  suggestMissingSymbolsAction,
  type ActionState,
  type SuggestMissingState,
} from "@/app/(app)/actions";

const vazio: SuggestMissingState = {};
const vazioAplicar: ActionState = {};

function Procurar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-secondary text-xs" disabled={pending}>
      {pending ? "A procurar…" : "Sugerir símbolos em falta"}
    </button>
  );
}

function Aplicar({ n }: { n: number }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary text-xs" disabled={pending || n === 0}>
      {pending ? "A gravar…" : `Aplicar os escolhidos (${n})`}
    </button>
  );
}

export function SuggestMissingSymbols() {
  const [state, procurar] = useFormState(suggestMissingSymbolsAction, vazio);
  const [aplicado, aplicar] = useFormState(applySymbolsAction, vazioAplicar);

  const propostas = state.proposals ?? [];
  const falhas = state.semProposta ?? [];

  return (
    <div className="space-y-3">
      <form action={procurar}>
        <Procurar />
      </form>

      {state.error ? (
        <p role="alert" className="text-xs text-fg-faint">{state.error}</p>
      ) : null}

      {aplicado.message ? (
        <p className="rounded-xl border border-hair bg-panel2/40 px-3 py-2 text-xs text-fg-muted">
          {aplicado.message}
        </p>
      ) : null}
      {aplicado.error ? (
        <p role="alert" className="text-xs text-debt">{aplicado.error}</p>
      ) : null}

      {propostas.length > 0 && !aplicado.ok ? (
        <form action={aplicar} className="space-y-3 rounded-xl border border-hair bg-panel2/30 p-4">
          <div>
            <p className="label mb-0.5">Símbolos propostos</p>
            <p className="text-xs text-fg-faint">
              Todos já foram confirmados contra a fonte de cotações — mas isso só
              prova que o ticker existe, não que é desta empresa. Desmarca o que
              não reconheceres.
            </p>
          </div>

          <ul className="space-y-2">
            {propostas.map((p) => (
              <li key={p.assetId}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-hair2 bg-bg/40 p-2.5 transition hover:border-fg/20">
                  <input
                    type="checkbox"
                    name="apply"
                    value={`${p.assetId}:${p.symbol}`}
                    defaultChecked
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate text-xs text-fg-muted">{p.assetName}</span>
                      <span className="font-mono text-xs font-semibold text-fg">
                        {p.symbol.toUpperCase()}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-fg-faint">
                      {p.bolsa}
                      {p.moeda ? ` · ${p.moeda}` : ""}
                      {p.lastDate ? ` · fecho de ${p.lastDate}` : ""}
                      {p.porque ? ` — ${p.porque}` : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <Aplicar n={propostas.length} />
        </form>
      ) : null}

      {/* O que não deu. Um resultado que só mostra os acertos lê-se como
          "está tudo tratado" — e ficariam ativos sem símbolo à espera de
          alguém reparar neles por acaso. */}
      {falhas.length > 0 ? (
        <div className="rounded-xl border border-hair bg-panel2/20 p-3">
          <p className="mb-1.5 text-xs text-fg-muted">
            Sem proposta para {falhas.length}, que continuam a precisar do símbolo à mão:
          </p>
          <ul className="space-y-1">
            {falhas.map((f) => (
              <li key={f.assetName} className="text-[11px] leading-snug text-fg-faint">
                <span className="text-fg-muted">{f.assetName}</span> — {f.problem}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
