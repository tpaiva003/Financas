"use client";

/**
 * As séries temporais de uma empresa, em acordeão e por tema.
 *
 * **Porque é que isto não é mais uma tabela.** A tabela que já existia mostra
 * dez indicadores ao mesmo tempo, e ler uma tendência ali obriga a percorrer
 * uma linha com os olhos e a guardar quatro números de cabeça. O que se procura
 * quando se olha para o historial de uma empresa não é um número: é uma
 * direcção — a margem está a abrir ou a fechar, a dívida está a subir ou a
 * descer. Por isso cada indicador traz o seu desenho ao lado dos seus números,
 * e os temas abrem um de cada vez para caber num telemóvel.
 *
 * **Os números vão sempre ao lado do desenho, e não em vez dele.** Uma linha
 * com o eixo cortado exagera o movimento, e uma tendência de "+3 pontos" pode
 * ser um degrau ou um regresso ao que era. Quem quiser confirmar tem a série
 * inteira na mesma linha.
 *
 * **Os trimestres medem sazonalidade tanto como desempenho** — um trimestre de
 * Natal a seguir a um de janeiro "cresce" sozinho. Ao escolher a vista
 * trimestral isso é dito por palavras, porque a alternativa é alguém ler o
 * calendário como se fosse o negócio.
 */

import { useState } from "react";
import { tendenciaDaSerie, type AnoFundamental } from "@/lib/domain";

type Unidade = "pct" | "mM" | "vezes";

interface Indicador {
  id: string;
  label: string;
  unidade: Unidade;
  valor: (a: AnoFundamental) => number | null;
  /** Falso quando subir é piorar — a dívida é o caso. */
  subirEBom?: boolean;
  nota: string;
}

interface Tema {
  id: string;
  titulo: string;
  pergunta: string;
  indicadores: readonly Indicador[];
}

const TEMAS: readonly Tema[] = [
  {
    id: "crescimento",
    titulo: "Crescimento",
    pergunta: "O negócio está a ficar maior, e o dinheiro acompanha?",
    indicadores: [
      {
        id: "receita",
        label: "Receita",
        unidade: "mM",
        valor: (a) => a.receitaBilioes,
        nota: "O tamanho do negócio.",
      },
      {
        id: "fcf",
        label: "Fluxo de caixa livre",
        unidade: "mM",
        valor: (a) => a.fcfBilioes,
        nota: "O dinheiro que sobra depois de investir no negócio. É este número que o DCF projeta — e por isso é o que mais vale a pena olhar de perto.",
      },
    ],
  },
  {
    id: "rentabilidade",
    titulo: "Rentabilidade",
    pergunta: "Quanto é que sobra de cada euro que entra, e do capital empregue?",
    indicadores: [
      {
        id: "roce",
        label: "ROCE",
        unidade: "pct",
        valor: (a) => a.rocePct,
        nota: "Quanto rende o capital que a empresa tem empregue. É o rácio que melhor separa uma boa empresa de uma empresa grande.",
      },
      {
        id: "roe",
        label: "ROE",
        unidade: "pct",
        valor: (a) => a.roePct,
        nota: "Retorno sobre o capital próprio. Com dívida alta sobe sem a empresa melhorar — por isso lê-se ao lado do ROCE, nunca sozinho.",
      },
      {
        id: "bruta",
        label: "Margem bruta",
        unidade: "pct",
        valor: (a) => a.margemBrutaPct,
        nota: "Quanto sobra depois do custo do que se vende. Costuma medir poder de preço.",
      },
      {
        id: "operacional",
        label: "Margem operacional",
        unidade: "pct",
        valor: (a) => a.margemOperacionalPct,
        nota: "Quanto sobra da receita depois de operar. A subir com a receita a crescer é escala; a subir com a receita a cair é encolhimento.",
      },
      {
        id: "liquida",
        label: "Margem líquida",
        unidade: "pct",
        valor: (a) => a.margemLiquidaPct,
        nota: "O que sobra no fim de tudo, já com juros e impostos.",
      },
      {
        id: "margemFcf",
        label: "Margem do fluxo livre",
        unidade: "pct",
        valor: (a) => a.margemFcfPct,
        nota: "Quanto de cada euro de receita se transforma em dinheiro disponível. É a ponte entre o lucro contabilístico e o dinheiro a sério.",
      },
    ],
  },
  {
    id: "solidez",
    titulo: "Solidez financeira",
    pergunta: "A empresa aguenta um ano mau sem depender de ninguém?",
    indicadores: [
      {
        id: "divida",
        label: "Dívida / capital próprio",
        unidade: "pct",
        valor: (a) => a.dividaSobreCapitalPct,
        subirEBom: false,
        nota: "Quanto deve por cada euro que é dos acionistas. Aqui, subir é piorar.",
      },
      {
        id: "liquidez",
        label: "Liquidez corrente",
        unidade: "vezes",
        valor: (a) => a.liquidezCorrente,
        nota: "Ativo corrente sobre passivo corrente. Abaixo de 1 é aperto de tesouraria.",
      },
    ],
  },
];

function formatar(v: number | null, u: Unidade): string {
  if (v === null) return "—";
  const n = String(Math.round(v * 100) / 100).replace(".", ",");
  if (u === "pct") return `${n}%`;
  if (u === "mM") return `${n}`;
  return n;
}

/**
 * O desenho da série, pequeno e ao lado dos números.
 *
 * Salta os períodos sem leitura em vez de os interpolar: uma linha reta entre
 * dois pontos que existem desenha, pelo meio, períodos que ninguém mediu.
 */
function Linha({
  valores,
  bom,
}: {
  valores: (number | null)[];
  bom: boolean;
}) {
  const presentes = valores.filter((v): v is number => v !== null);
  if (presentes.length < 2) return <div className="h-5 w-16" aria-hidden="true" />;

  const W = 64;
  const H = 20;
  const min = Math.min(...presentes);
  const max = Math.max(...presentes);
  const vao = max - min || Math.max(Math.abs(max) * 0.1, 1);
  const x = (i: number) => (i / (valores.length - 1)) * W;
  const y = (v: number) => 2 + (1 - (v - (min - vao * 0.1)) / (vao * 1.2)) * (H - 4);

  const segmentos: string[] = [];
  let atual: string[] = [];
  valores.forEach((v, i) => {
    if (v === null) {
      if (atual.length > 1) segmentos.push(atual.join(" "));
      atual = [];
      return;
    }
    atual.push(`${atual.length === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
  });
  if (atual.length > 1) segmentos.push(atual.join(" "));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-5 w-16 shrink-0 overflow-visible"
      aria-hidden="true"
      focusable="false"
    >
      {segmentos.map((d, k) => (
        <path
          key={k}
          d={d}
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={bom ? "stroke-credit" : "stroke-debt"}
        />
      ))}
      <circle
        cx={x(valores.length - 1 - [...valores].reverse().findIndex((v) => v !== null))}
        cy={y(presentes[presentes.length - 1]!)}
        r="1.8"
        className={bom ? "fill-credit" : "fill-debt"}
      />
    </svg>
  );
}

export function SeriesFundamentais({
  anual,
  trimestral,
}: {
  anual: AnoFundamental[];
  trimestral: AnoFundamental[];
}) {
  // Sem trimestres não há nada para trocar, e um botão que não muda nada é
  // ruído. Dois pontos é o mínimo para haver série.
  const temTrimestres = trimestral.length >= 2;
  const [vista, setVista] = useState<"anual" | "trimestral">("anual");
  const periodos = vista === "trimestral" && temTrimestres ? trimestral : anual;

  if (periodos.length < 2) return null;

  return (
    <section className="card p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">Séries ao longo do tempo</p>
        {temTrimestres ? (
          <div className="flex gap-1" role="group" aria-label="Granularidade da série">
            {(["anual", "trimestral"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                aria-pressed={vista === v}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  vista === v
                    ? "border-fg/30 bg-panel2 text-fg"
                    : "border-hair text-fg-faint hover:text-fg-muted"
                }`}
              >
                {v === "anual" ? "Anual" : "Trimestral"}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="mb-3 text-xs leading-snug text-fg-faint">
        {periodos.length} {periodos.length === 1 ? "período" : "períodos"}, de{" "}
        {periodos[0]!.rotulo} a {periodos[periodos.length - 1]!.rotulo}. Abre um
        tema para ver a direcção de cada indicador com os números ao lado.
      </p>

      {/* A sazonalidade tem de ser dita antes de alguém ler a tabela. Um
          trimestre de Natal a seguir a um de janeiro sobe sozinho, e a coluna
          "Tendência" não sabe distinguir isso de uma empresa a melhorar. */}
      {vista === "trimestral" ? (
        <p className="mb-3 rounded-lg border border-hair bg-panel2/50 px-3 py-2 text-xs leading-snug text-fg-muted">
          Nos trimestres, parte do movimento é o calendário e não o negócio:
          quase todas as empresas têm trimestres fortes e fracos que se repetem
          todos os anos. Para julgar a direcção, compara cada trimestre com o
          mesmo trimestre do ano anterior — e usa a vista anual para as
          conclusões.
        </p>
      ) : null}

      <div className="space-y-2">
        {TEMAS.map((tema, i) => {
          // Só os indicadores com duas leituras: uma linha de traços não é
          // informação, é uma linha a ocupar espaço.
          const uteis = tema.indicadores.filter(
            (ind) => periodos.filter((p) => ind.valor(p) !== null).length >= 2,
          );
          if (uteis.length === 0) return null;

          return (
            <details
              key={tema.id}
              // O primeiro tema aberto: um acordeão todo fechado esconde que
              // há alguma coisa lá dentro.
              open={i === 0}
              className="group rounded-xl border border-hair2 px-4 py-3"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="text-sm font-medium text-fg">{tema.titulo}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-faint">
                  {uteis.length} {uteis.length === 1 ? "indicador" : "indicadores"}
                  <span className="ml-2 inline-block transition-transform group-open:rotate-90">
                    ›
                  </span>
                </span>
              </summary>

              <p className="mt-1.5 text-xs text-fg-faint">{tema.pergunta}</p>

              <div className="-mx-1 mt-3 overflow-x-auto px-1">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="text-right text-[11px] text-fg-muted">
                      <th className="pb-2 text-left font-normal">Indicador</th>
                      <th className="pb-2 font-normal" />
                      {periodos.map((p) => (
                        <th key={p.rotulo} className="pb-2 pl-2 font-normal">
                          {p.rotulo}
                        </th>
                      ))}
                      <th className="pb-2 pl-3 font-normal">Tendência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uteis.map((ind) => {
                      const valores = periodos.map((p) => ind.valor(p));
                      const t = tendenciaDaSerie(valores);
                      const subiu = t !== null && t.variacao >= 0;
                      const bom = subiu === (ind.subirEBom ?? true);
                      return (
                        <tr key={ind.id} className="align-middle">
                          <td className="py-1.5 pr-2 text-left">
                            <span className="text-xs text-fg" title={ind.nota}>
                              {ind.label}
                            </span>
                          </td>
                          <td className="py-1.5">
                            <Linha valores={valores} bom={bom} />
                          </td>
                          {valores.map((v, k) => (
                            <td
                              key={k}
                              className="py-1.5 pl-2 text-right font-mono tnum text-xs text-fg-muted"
                            >
                              {formatar(v, ind.unidade)}
                            </td>
                          ))}
                          <td
                            className={`py-1.5 pl-3 text-right font-mono tnum text-xs ${
                              t === null ? "text-fg-faint" : bom ? "text-credit" : "text-debt"
                            }`}
                          >
                            {/*
                              A percentagem quando ela quer dizer alguma coisa, e
                              os pontos quando não quer: uma margem que vai de
                              −5% para 3% melhorou oito pontos, e a divisão dá
                              −160% — com o sinal ao contrário do que aconteceu.
                            */}
                            {t === null
                              ? "—"
                              : t.variacaoPct !== null
                                ? `${t.variacaoPct >= 0 ? "+" : ""}${String(t.variacaoPct).replace(".", ",")}%`
                                : `${t.variacao >= 0 ? "+" : ""}${String(Math.round(t.variacao * 10) / 10).replace(".", ",")}${ind.unidade === "pct" ? " p.p." : ""}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="mt-3 space-y-1 border-t border-hair2 pt-2.5">
                {uteis.map((ind) => (
                  <li key={ind.id} className="text-[11px] leading-snug text-fg-faint">
                    <span className="text-fg-muted">{ind.label}:</span> {ind.nota}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] leading-snug text-fg-faint">
        Os valores em milhares de milhões são da moeda em que a empresa relata as
        contas, que nem sempre é a moeda em que a ação cota. Um período em branco
        é um dado que a fonte não trouxe — não é um zero.
      </p>
    </section>
  );
}
