/**
 * O funil de avaliação: as empresas estudadas, por etapa.
 *
 * **Um estudo é um registo datado.** Cada cartão mostra o dia em que foi feito,
 * porque os pressupostos de um DCF envelhecem depressa: uma apresentação de
 * resultados chega para invalidar o fluxo de caixa que serviu de base a tudo. Um
 * valor sem data lê-se como o valor de hoje, e é a partir dele que alguém compra.
 *
 * Componente de servidor: não há estado nenhum aqui, só formulários que chamam
 * ações.
 */

import {
  ETAPAS,
  ETAPA_EXPLICACAO,
  ETAPA_LABEL,
  contarPorEtapa,
  formatCents,
  quantoFaltaDescer,
  type AvaliacaoNoFunil,
} from "@/lib/domain";
import { apagarAvaliacaoAction, mudarEtapaAvaliacaoAction } from "@/app/(app)/actions";

export function FunilAvaliacoes({ funil }: { funil: AvaliacaoNoFunil[] }) {
  if (funil.length === 0) {
    return (
      <p className="card p-5 text-sm leading-relaxed text-fg-muted">
        Ainda não guardaste nenhum estudo. Faz uma avaliação e guarda-a — é o que
        transforma um número numa decisão que se pode rever daqui a seis meses.
      </p>
    );
  }

  const contagem = contarPorEtapa(funil);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {ETAPAS.map((e) => (
          <span
            key={e}
            className="rounded-full border border-hair bg-panel2/40 px-3 py-1 text-xs text-fg-muted"
          >
            {ETAPA_LABEL[e]}{" "}
            <span className="font-mono tnum text-fg">{contagem[e]}</span>
          </span>
        ))}
      </div>

      {ETAPAS.filter((e) => contagem[e] > 0).map((etapa) => (
        <section key={etapa} className="space-y-3">
          <div>
            <p className="eyebrow">{ETAPA_LABEL[etapa]}</p>
            <p className="mt-1 text-xs text-fg-faint">{ETAPA_EXPLICACAO[etapa]}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {funil.filter((a) => a.etapa === etapa).map((a) => (
              <Cartao key={a.id} a={a} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Cartao({ a }: { a: AvaliacaoNoFunil }) {
  const falta = quantoFaltaDescer(a);
  const dia = new Date(`${a.data}T00:00:00Z`).toLocaleDateString("pt-PT");

  return (
    <article className={`card space-y-3 p-4 ${a.substituida ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{a.nome}</p>
          {a.simbolo ? (
            <p className="font-mono text-xs uppercase text-fg-faint">{a.simbolo}</p>
          ) : null}
        </div>
        <p className="shrink-0 text-right">
          <span className="font-mono tnum text-lg text-fg">{formatCents(a.precoPonderadoCents)}</span>
          <span className="block text-[11px] text-fg-faint">preço a que compras</span>
        </p>
      </div>

      {a.precoNaAlturaCents !== null ? (
        <p className="text-xs leading-snug text-fg-muted">
          Estava a{" "}
          <span className="font-mono tnum">{formatCents(a.precoNaAlturaCents)}</span> em {dia}.
          {falta !== null ? (
            <>
              {" "}
              Tem de descer{" "}
              <strong className="font-medium text-fg">
                {String(falta).replace(".", ",")}%
              </strong>{" "}
              para lá chegar.
            </>
          ) : (
            <> Já estava dentro do teu preço nesse dia.</>
          )}
        </p>
      ) : (
        <p className="text-xs text-fg-faint">Estudo de {dia}, sem preço de mercado registado.</p>
      )}

      {a.substituida ? (
        <p className="text-xs text-fg-faint">
          Substituído por um estudo mais recente desta empresa.
        </p>
      ) : a.envelhecida ? (
        <p className="text-xs text-fg-faint">
          Tem {Math.round(a.idadeDias / 30)} meses. Já passaram duas apresentações
          de resultados — vale a pena refazer antes de decidir com isto.
        </p>
      ) : null}

      {a.notas ? (
        <p className="whitespace-pre-line border-t border-hair2 pt-2 text-xs leading-relaxed text-fg-muted">
          {a.notas}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-hair2 pt-3">
        <form action={mudarEtapaAvaliacaoAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={a.id} />
          <label className="sr-only" htmlFor={`etapa-${a.id}`}>
            Mudar a etapa de {a.nome}
          </label>
          <select
            id={`etapa-${a.id}`}
            name="stage"
            defaultValue={a.etapa}
            className="input h-8 w-auto py-0 text-xs"
          >
            {ETAPAS.map((e) => (
              <option key={e} value={e}>
                {ETAPA_LABEL[e]}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary text-xs">
            Mudar
          </button>
        </form>

        <form action={apagarAvaliacaoAction} className="ml-auto">
          <input type="hidden" name="id" value={a.id} />
          <button type="submit" className="text-xs text-fg-faint hover:text-debt">
            Apagar
          </button>
        </form>
      </div>
    </article>
  );
}
