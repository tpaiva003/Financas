"use client";

import { useState } from "react";
import { HoldingsImport } from "@/components/HoldingsImport";
import { TradesImport } from "@/components/TradesImport";

type Mode = "movimentos" | "posicoes";

/**
 * Escolher o que se está a importar.
 *
 * As corretoras exportam dois ficheiros diferentes e as pessoas não têm de
 * saber a diferença de cor. Um traz **movimentos** (uma linha por operação, com
 * data) e outro traz **posições** (o que se tem hoje). Importar um pelo outro dá
 * disparates: um extrato de transações lido como posições aparece com centenas
 * de "posições", algumas com quantidades negativas, que são vendas.
 *
 * Os movimentos vêm primeiro de propósito: valem mais. Com as datas dá para
 * saber o que o dinheiro rendeu; com uma fotografia das posições, não.
 */
export function BrokerImport() {
  const [mode, setMode] = useState<Mode>("movimentos");

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="O que estás a importar"
        className="flex gap-2 rounded-full border border-hair bg-panel2/40 p-1"
      >
        <Tab
          selected={mode === "movimentos"}
          onSelect={() => setMode("movimentos")}
          label="Movimentos"
        />
        <Tab
          selected={mode === "posicoes"}
          onSelect={() => setMode("posicoes")}
          label="Posições"
        />
      </div>

      <p className="text-sm text-fg-muted">
        {mode === "movimentos" ? (
          <>
            Ficheiro de <span className="text-fg">transações</span>: uma linha por
            compra, venda ou dividendo, com data. É o que dá para calcular
            rentabilidade, porque diz quando é que cada euro entrou.
          </>
        ) : (
          <>
            Ficheiro de <span className="text-fg">posições</span>: o que tens hoje
            e a que preço. Mais rápido de trazer, mas sem datas não há
            rentabilidade, só o valor de agora.
          </>
        )}
      </p>

      {mode === "movimentos" ? <TradesImport /> : <HoldingsImport />}
    </div>
  );
}

function Tab({
  selected,
  onSelect,
  label,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex-1 rounded-full px-4 py-2 text-sm transition-colors ${
        selected ? "bg-fg text-bg" : "text-fg-muted hover:text-fg"
      }`}
    >
      {label}
    </button>
  );
}
