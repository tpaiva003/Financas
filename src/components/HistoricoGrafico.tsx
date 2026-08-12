"use client";

/**
 * O historial de uma empresa, em linha e ao longo dos anos.
 *
 * **Porque é que uma tabela não chegava.** Uma margem operacional de 32% não
 * diz nada; 22 → 26 → 32 diz que a empresa está a ganhar escala, e 40 → 36 → 32
 * diz o contrário com o mesmo número no fim. Numa tabela essa diferença lê-se —
 * mas só por quem se lembrar de a procurar. Numa linha vê-se antes de se
 * procurar, e é essa a diferença.
 *
 * **Uma métrica de cada vez, escolhida a clicar.** Sobrepor ROCE, margens e
 * fluxo livre no mesmo eixo era juntar percentagens com milhares de milhões e
 * pôr o desenho a mentir sobre a escala. Cada uma tem o seu eixo, e trocar
 * custa um clique.
 *
 * **O eixo não começa em zero, e isso é dito.** Uma margem que anda entre 30% e
 * 33% desenhada a partir do zero é uma linha reta que esconde a única coisa que
 * interessa. Cortar o eixo exagera o movimento, e por isso os valores estão
 * escritos por cima — quem olha vê a variação e o seu tamanho real.
 */

import { useState } from "react";
import type { AnoFundamental } from "@/lib/domain";

type Unidade = "pct" | "mM" | "vezes";

interface Metrica {
  id: string;
  label: string;
  unidade: Unidade;
  valor: (a: AnoFundamental) => number | null;
  /** Uma frase a dizer o que a linha significa quando sobe. */
  nota: string;
}

const METRICAS: readonly Metrica[] = [
  {
    id: "roce",
    label: "ROCE",
    unidade: "pct",
    valor: (a) => a.rocePct,
    nota: "Quanto rende o capital que a empresa tem empregue. É o rácio que melhor separa uma boa empresa de uma empresa grande.",
  },
  {
    id: "operacional",
    label: "Margem operacional",
    unidade: "pct",
    valor: (a) => a.margemOperacionalPct,
    nota: "Quanto sobra da receita depois de operar. A subir com a receita a crescer é escala; a subir com a receita a cair é encolhimento.",
  },
  {
    id: "bruta",
    label: "Margem bruta",
    unidade: "pct",
    valor: (a) => a.margemBrutaPct,
    nota: "Quanto sobra depois do custo do que se vende. Costuma medir poder de preço.",
  },
  {
    id: "liquida",
    label: "Margem líquida",
    unidade: "pct",
    valor: (a) => a.margemLiquidaPct,
    nota: "O que sobra no fim de tudo, já com juros e impostos.",
  },
  {
    id: "fcf",
    label: "Fluxo livre",
    unidade: "mM",
    valor: (a) => a.fcfBilioes,
    nota: "O dinheiro que sobra depois de investir no negócio. É este número que o DCF projeta.",
  },
  {
    id: "margemFcf",
    label: "Margem do fluxo livre",
    unidade: "pct",
    valor: (a) => a.margemFcfPct,
    nota: "Quanto de cada euro de receita se transforma em dinheiro disponível.",
  },
  {
    id: "receita",
    label: "Receita",
    unidade: "mM",
    valor: (a) => a.receitaBilioes,
    nota: "O tamanho do negócio.",
  },
  {
    id: "roe",
    label: "ROE",
    unidade: "pct",
    valor: (a) => a.roePct,
    nota: "Retorno sobre o capital próprio. Com dívida alta sobe sem a empresa melhorar.",
  },
  {
    id: "divida",
    label: "Dívida / capital",
    unidade: "pct",
    valor: (a) => a.dividaSobreCapitalPct,
    nota: "Quanto deve por cada euro que é dos acionistas. Aqui, subir é piorar.",
  },
  {
    id: "liquidez",
    label: "Liquidez corrente",
    unidade: "vezes",
    valor: (a) => a.liquidezCorrente,
    nota: "Ativo corrente sobre passivo corrente. Abaixo de 1 é aperto de tesouraria.",
  },
];

const W = 300;
const H = 90;
/** Espaço em cima para os valores escritos não saírem do desenho. */
const MARGEM_Y = 14;

function formatar(v: number, u: Unidade): string {
  const n = String(Math.round(v * 10) / 10).replace(".", ",");
  if (u === "pct") return `${n}%`;
  if (u === "mM") return `${n} mM`;
  return n;
}

export function HistoricoGrafico({ historico }: { historico: AnoFundamental[] }) {
  const [escolhida, setEscolhida] = useState(METRICAS[0]!.id);
  const [sobre, setSobre] = useState<number | null>(null);

  // Só as métricas que têm mesmo dois pontos: um chip que abre um gráfico vazio
  // é pior do que chip nenhum.
  const disponiveis = METRICAS.filter(
    (m) => historico.filter((a) => m.valor(a) !== null).length >= 2,
  );
  if (disponiveis.length === 0 || historico.length < 2) return null;

  const metrica = disponiveis.find((m) => m.id === escolhida) ?? disponiveis[0]!;
  const valores = historico.map((a) => metrica.valor(a));
  const presentes = valores.filter((v): v is number => v !== null);

  const min = Math.min(...presentes);
  const max = Math.max(...presentes);
  // Uma série plana dividiria por zero. Abre-se um intervalo à volta dela.
  const vao = max - min || Math.max(Math.abs(max) * 0.1, 1);
  const topo = max + vao * 0.15;
  const base = min - vao * 0.15;

  const x = (i: number) => (historico.length === 1 ? W / 2 : (i / (historico.length - 1)) * W);
  const y = (v: number) => MARGEM_Y + (1 - (v - base) / (topo - base)) * (H - MARGEM_Y * 2);

  // O traço salta os anos sem dado em vez de os inventar por interpolação: uma
  // linha reta entre 2021 e 2024 desenha três anos que ninguém mediu.
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

  const ultimo = presentes[presentes.length - 1]!;
  const primeiro = presentes[0]!;
  const subiu = ultimo >= primeiro;
  const aSubirEBom = metrica.id !== "divida";
  const cor = subiu === aSubirEBom ? "credit" : "debt";

  const activo = sobre !== null ? valores[sobre] ?? null : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {disponiveis.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setEscolhida(m.id)}
            aria-pressed={m.id === metrica.id}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              m.id === metrica.id
                ? "border-fg/30 bg-panel2 text-fg"
                : "border-hair text-fg-faint hover:text-fg-muted"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-fg-muted">
        {sobre !== null && activo !== null ? (
          <>
            <span className="text-fg-faint">{historico[sobre]!.ano}:</span>{" "}
            <span className="font-mono tnum text-fg">{formatar(activo, metrica.unidade)}</span>
          </>
        ) : (
          <>
            <span className="text-fg-faint">
              {historico[0]!.ano}–{historico[historico.length - 1]!.ano}:
            </span>{" "}
            <span className="font-mono tnum text-fg">
              {formatar(primeiro, metrica.unidade)} → {formatar(ultimo, metrica.unidade)}
            </span>{" "}
            <span className="text-fg-faint">— passa o rato pelo gráfico</span>
          </>
        )}
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-28 w-full overflow-visible"
        role="img"
        aria-label={`${metrica.label} de ${historico[0]!.ano} a ${historico[historico.length - 1]!.ano}`}
        onMouseLeave={() => setSobre(null)}
        onPointerLeave={() => setSobre(null)}
      >
        {segmentos.map((d, k) => (
          <path
            key={k}
            d={d}
            fill="none"
            className={cor === "credit" ? "stroke-credit" : "stroke-debt"}
            strokeWidth={1.4}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {valores.map((v, i) =>
          v === null ? null : (
            <circle
              key={i}
              cx={x(i)}
              cy={y(v)}
              r={sobre === i ? 3 : 1.8}
              className={cor === "credit" ? "fill-credit" : "fill-debt"}
            />
          ),
        )}

        {/* Faixas invisíveis: apontar a um ponto de 2px é um exercício de perícia. */}
        {historico.map((a, i) => (
          <rect
            key={a.ano}
            x={x(i) - W / historico.length / 2}
            y={0}
            width={W / historico.length}
            height={H}
            fill="transparent"
            onMouseEnter={() => setSobre(i)}
            onPointerEnter={() => setSobre(i)}
          />
        ))}
      </svg>

      <div className="flex justify-between font-mono text-[10px] text-fg-faint">
        {historico.map((a) => (
          <span key={a.ano}>{a.ano}</span>
        ))}
      </div>

      <p className="text-xs leading-snug text-fg-faint">
        {metrica.nota} O eixo não começa em zero — foi cortado para se ver o
        movimento, e por isso os valores vão escritos.
      </p>
    </div>
  );
}
