"use client";

/**
 * A grelha dos investimentos, com as posições fechadas arrumadas.
 *
 * **Porquê esconder por omissão.** Uma importação de corretora traz tudo o que
 * alguma vez se comprou, incluindo o que já foi vendido por inteiro. Essas
 * fichas ficam com zero unidades e zero euros, e não há nada a fazer com elas —
 * mas ocupam o mesmo espaço que as posições vivas e empurram-nas para baixo.
 * Numa carteira com cinquenta produtos, o que se faz é **procurar uma**, e ter
 * de saltar por cima de trinta zeros é trabalho a mais.
 *
 * **Não desaparecem: ficam a um clique.** Uma posição fechada continua a ser
 * história — os movimentos estão lá e o que se ganhou com ela também. Esconder
 * sem dizer que se escondeu seria fazer desaparecer coisas de quem está a
 * contar dinheiro.
 *
 * **Isto não mexe em número nenhum.** É só a lista. Uma posição a zero vale
 * zero no património, esteja à vista ou não.
 */

import { useState } from "react";
import { InvestmentCard, type InvestmentCardData } from "./InvestmentCard";

/** Uma posição fechada: já não há unidades nenhumas. */
function fechada(d: InvestmentCardData): boolean {
  return d.quantity <= 0;
}

export function InvestmentGrid({ items }: { items: InvestmentCardData[] }) {
  const [mostrarFechadas, setMostrarFechadas] = useState(false);

  const fechadas = items.filter(fechada);
  const visiveis = mostrarFechadas ? items : items.filter((d) => !fechada(d));

  return (
    <div className="p-4">
      {fechadas.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-fg-faint">
            {fechadas.length === 1
              ? "1 posição já fechada"
              : `${fechadas.length} posições já fechadas`}
            , sem unidades nenhumas.
          </p>
          <button
            type="button"
            onClick={() => setMostrarFechadas((v) => !v)}
            aria-pressed={mostrarFechadas}
            className="rounded-full border border-hair px-2.5 py-1 text-xs text-fg-muted transition hover:border-fg/30 hover:text-fg"
          >
            {mostrarFechadas ? "Esconder" : "Mostrar"}
          </button>
        </div>
      ) : null}

      {visiveis.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-muted">
          Só há posições fechadas por aqui.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visiveis.map((d) => (
            <InvestmentCard key={d.id} data={d} />
          ))}
        </ul>
      )}
    </div>
  );
}
