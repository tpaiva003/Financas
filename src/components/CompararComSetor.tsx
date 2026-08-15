"use client";

/**
 * A empresa em estudo, ao lado das que já estudaste no mesmo setor.
 *
 * **É a coluna que faltava da folha de cálculo, feita da única forma honesta.**
 * Médias setoriais a sério não existem em fonte gratuita nenhuma, e inventá-las
 * dava números com o tamanho certo, ar de facto, e sem forma de serem
 * conferidos. O que existe e se confere são os estudos que já fizeste — e a
 * pergunta que eles respondem é mais útil do que a original: *isto é melhor ou
 * pior do que aquilo que eu já vi?*
 *
 * **A base vai colada ao resultado.** Com um estudo só não há mediana nenhuma;
 * há a outra empresa, e o ecrã diz isso por palavras. Um "acima do setor"
 * apoiado em nada é a pior das respostas possíveis, porque é a mais
 * convincente.
 */

import {
  compararNoSetor,
  confiancaPorExtenso,
  setorPorExtenso,
  type Fundamentais,
} from "@/lib/domain";

/** Um estudo anterior, com os rácios que ficaram congelados nele. */
export interface EstudoAnterior {
  id: string;
  nome: string;
  setor: string | null;
  rocePct: number | null;
  margemOperacionalPct: number | null;
  margemFcfPct: number | null;
  crescimentoFcfPct: number | null;
}

interface Indicador {
  id: string;
  label: string;
  daEmpresa: (f: Fundamentais) => number | null;
  doEstudo: (e: EstudoAnterior) => number | null;
  /** Falso quando subir é piorar. Nenhum destes é, mas o dia em que houver… */
  subirEBom?: boolean;
}

const INDICADORES: readonly Indicador[] = [
  {
    id: "roce",
    label: "ROCE",
    daEmpresa: (f) => f.medias.rocePct,
    doEstudo: (e) => e.rocePct,
  },
  {
    id: "operacional",
    label: "Margem operacional",
    daEmpresa: (f) => f.medias.margemOperacionalPct,
    doEstudo: (e) => e.margemOperacionalPct,
  },
  {
    id: "margemFcf",
    label: "Margem do fluxo livre",
    daEmpresa: (f) => f.medias.margemFcfPct,
    doEstudo: (e) => e.margemFcfPct,
  },
  {
    id: "crescimento",
    label: "Crescimento do fluxo livre",
    daEmpresa: (f) => f.medias.crescimentoFcfPct,
    doEstudo: (e) => e.crescimentoFcfPct,
  },
];

function pct(v: number): string {
  return `${String(Math.round(v * 10) / 10).replace(".", ",")}%`;
}

export function CompararComSetor({
  contas,
  anteriores,
  valuationId,
}: {
  contas: Fundamentais;
  anteriores: readonly EstudoAnterior[];
  /** O estudo que está a ser refeito, para não se comparar consigo próprio. */
  valuationId?: string | null;
}) {
  const comparacoes = INDICADORES.map((ind) => ({
    ind,
    r: compararNoSetor({
      setor: contas.setor,
      valorDaEmpresa: ind.daEmpresa(contas),
      carteira: anteriores.map((e) => ({
        id: e.id,
        nome: e.nome,
        setor: e.setor,
        valor: ind.doEstudo(e),
      })),
      excluirId: valuationId ?? null,
    }),
  })).filter((c) => c.r !== null);

  // Sem comparação nenhuma não se desenha uma caixa vazia a dizer que não há
  // nada: quem estuda a primeira empresa de um setor não tem um problema.
  if (comparacoes.length === 0) return null;

  const quantas = comparacoes[0]!.r!.quantas;

  return (
    <section className="card p-5">
      <p className="eyebrow mb-1">
        Contra o que já estudaste em {setorPorExtenso(contas.setor)}
      </p>
      <p className="mb-3 text-xs leading-snug text-fg-faint">
        {confiancaPorExtenso(quantas)} Não são médias do setor a sério — essas não
        existem em fonte gratuita nenhuma, e inventá-las dava um número com ar de
        facto que ninguém consegue conferir. São os teus estudos.
      </p>

      <ul className="space-y-2.5">
        {comparacoes.map(({ ind, r }) => {
          const acima = r!.diferenca >= 0;
          const bom = acima === (ind.subirEBom ?? true);
          return (
            <li key={ind.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-sm text-fg">{ind.label}</span>
              <span className="font-mono text-xs tnum text-fg-muted">
                <span className="text-fg">{pct(r!.valorDaEmpresa)}</span>
                {" vs "}
                {pct(r!.medianaDaCarteira)}
                <span className={`ml-2 ${bom ? "text-credit" : "text-debt"}`}>
                  {acima ? "+" : ""}
                  {String(r!.diferenca).replace(".", ",")} p.p.
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-fg-faint hover:text-fg-muted">
          Quais são
        </summary>
        <ul className="mt-2 space-y-1">
          {comparacoes[0]!.r!.pares.map((p) => (
            <li key={p.id} className="text-xs text-fg-muted">
              {p.nome}{" "}
              <span className="font-mono text-fg-faint">{pct(p.valor)} de ROCE</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
