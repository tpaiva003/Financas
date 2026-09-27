"use client";

/**
 * A série mensal da plataforma, com a métrica à escolha.
 *
 * **O que estava avariado aqui, e vale a pena não repetir.** As barras eram um
 * `<span>` com `height` em percentagem dentro de um `<li>` que era item de um
 * `flex` com `items-end`. Com `items-end`, o item encolhe para a altura do
 * conteúdo — e uma percentagem de uma altura *auto* resolve para zero. As barras
 * tinham zero pixéis, **todas**, e o gráfico ficou vazio durante semanas com os
 * dados certos por baixo. Nenhum teste desta app apanha isto: é CSS, e o
 * `next build` compila-o na mesma.
 *
 * Daí as duas defesas que estão aqui:
 *
 * 1. A altura é dada ao `<li>`, que tem altura definida do contentor, e nunca a
 *    um filho de um item encolhido.
 * 2. **Os números vão escritos por cima das barras.** Se o desenho voltar a
 *    colapsar, os valores continuam à vista e a avaria denuncia-se sozinha. Um
 *    gráfico vazio e um gráfico avariado eram indistinguíveis, e é por isso que
 *    ninguém deu por ele.
 *
 * **Uma métrica de cada vez.** Registos, contas novas, ambientes novos e
 * ambientes ativos têm escalas muito diferentes — cento e tal registos ao lado
 * de duas contas dá uma barra e onze riscos.
 */

import { useState } from "react";

export interface MesDaPlataforma {
  mes: string;
  contasNovas: number;
  ambientesNovos: number;
  registosNovos: number;
  ambientesAtivos: number;
}

interface Metrica {
  id: string;
  label: string;
  valor: (m: MesDaPlataforma) => number;
  nota: string;
}

const METRICAS: readonly Metrica[] = [
  {
    id: "registos",
    label: "Registos",
    valor: (m) => m.registosNovos,
    nota: "Tudo o que entrou na app nesse mês: despesas, ativos, movimentos, rendimentos. É a medida de uso a sério.",
  },
  {
    id: "contas",
    label: "Contas novas",
    valor: (m) => m.contasNovas,
    nota: "Quantas contas se registaram nesse mês.",
  },
  {
    id: "ambientes",
    label: "Ambientes novos",
    valor: (m) => m.ambientesNovos,
    nota: "Quantos ambientes nasceram nesse mês. Uma conta pode ter mais do que um.",
  },
  {
    id: "ativos",
    label: "Ambientes ativos",
    valor: (m) => m.ambientesAtivos,
    nota: "Quantos ambientes registaram pelo menos uma coisa nesse mês. É o número que distingue uso de inscrições.",
  },
];

function mesLabel(ym: string): string {
  return new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("pt-PT", {
    month: "short",
    timeZone: "UTC",
  });
}

export function PlataformaGrafico({ meses }: { meses: MesDaPlataforma[] }) {
  const [escolhida, setEscolhida] = useState(METRICAS[0]!.id);
  const metrica = METRICAS.find((m) => m.id === escolhida) ?? METRICAS[0]!;

  const valores = meses.map((m) => metrica.valor(m));
  const maximo = Math.max(1, ...valores);
  const total = valores.reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {METRICAS.map((m) => (
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

      <p className="font-mono text-[11px] tnum text-fg-faint">
        Máximo {maximo} · {total} ao todo nestes {meses.length} meses
      </p>

      {/*
        `items-stretch` (o que vem por omissão) é o que faz isto funcionar: cada
        `<li>` fica com a altura do contentor, e é sobre ela que a percentagem da
        barra se calcula. Com `items-end` o item encolhia e a barra dava zero.
      */}
      <ul className="flex gap-1.5" style={{ height: "8rem" }}>
        {meses.map((m) => {
          const v = metrica.valor(m);
          return (
            <li key={m.mes} className="flex flex-1 flex-col justify-end gap-1">
              {/* O valor por cima da barra. Ver o cabeçalho: é isto que faz um
                  desenho colapsado denunciar-se em vez de passar por "não há
                  dados". Um zero fica apagado para não competir com o resto. */}
              <span
                className={`block text-center font-mono text-[10px] tnum ${
                  v > 0 ? "text-fg-muted" : "text-fg-faint/50"
                }`}
              >
                {v}
              </span>
              <span
                className={`block rounded-t ${v > 0 ? "bg-fg/70" : "bg-hair"}`}
                style={{ height: `${v > 0 ? Math.max(4, Math.round((v / maximo) * 100)) : 2}%` }}
                title={`${m.mes}: ${m.registosNovos} registos, ${m.ambientesAtivos} ambientes ativos, +${m.contasNovas} contas, +${m.ambientesNovos} ambientes`}
              />
            </li>
          );
        })}
      </ul>

      <ul className="flex gap-1.5">
        {meses.map((m) => (
          <li
            key={m.mes}
            className="flex-1 truncate text-center font-mono text-[10px] text-fg-faint"
          >
            {mesLabel(m.mes)}
          </li>
        ))}
      </ul>

      <p className="text-xs leading-snug text-fg-faint">{metrica.nota}</p>
    </div>
  );
}
