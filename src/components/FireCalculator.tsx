"use client";

import { useState } from "react";
import { buildFire, formatCents, toCents } from "@/lib/domain";

/** Euros para o campo de texto, em formato europeu. */
function euros(cents: number): string {
  return (cents / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function parse(v: string): number {
  const clean = v.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Calculadora FIRE.
 *
 * Arranca com números reais: o património vem do que está registado e o gasto
 * anual vem da média mensal das despesas do ambiente. Tudo é editável, porque
 * o valor de um exercício destes está em mexer nos pressupostos.
 */
export function FireCalculator({
  netWorthCents,
  suggestedAnnualExpensesCents,
}: {
  netWorthCents: number;
  suggestedAnnualExpensesCents: number;
}) {
  const [annual, setAnnual] = useState(euros(suggestedAnnualExpensesCents));
  const [savings, setSavings] = useState("500");
  const [swr, setSwr] = useState(4);
  const [ret, setRet] = useState(5);

  const result = buildFire({
    netWorthCents,
    annualExpensesCents: toCents(parse(annual)),
    monthlySavingsCents: toCents(parse(savings)),
    withdrawalRatePct: swr,
    realReturnPct: ret,
  });

  return (
    <div className="card space-y-5 p-6">
      <div>
        <h2 className="label">Independência financeira</h2>
        <p className="text-sm text-fg-muted">
          Quando o património rende o suficiente para pagar o ano todo, trabalhar
          passa a ser escolha. Os valores começam nos teus números reais e podes
          mexer em tudo.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="fire-annual">Gasto por ano</label>
          <div className="relative">
            <input
              id="fire-annual"
              inputMode="decimal"
              value={annual}
              onChange={(e) => setAnnual(e.target.value)}
              className="input pr-8"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-fg-faint">
              €
            </span>
          </div>
          {suggestedAnnualExpensesCents > 0 ? (
            <p className="mt-1 text-xs text-fg-faint">
              Sugerido a partir das tuas despesas:{" "}
              <button
                type="button"
                onClick={() => setAnnual(euros(suggestedAnnualExpensesCents))}
                className="underline underline-offset-2 hover:text-fg-muted"
              >
                {formatCents(suggestedAnnualExpensesCents)}
              </button>
            </p>
          ) : null}
        </div>

        <div>
          <label className="label" htmlFor="fire-savings">Poupança por mês</label>
          <div className="relative">
            <input
              id="fire-savings"
              inputMode="decimal"
              value={savings}
              onChange={(e) => setSavings(e.target.value)}
              className="input pr-8"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-fg-faint">
              €
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          id="fire-swr"
          label="Taxa de levantamento"
          value={swr}
          min={2}
          max={6}
          step={0.5}
          onChange={setSwr}
          hint="A regra dos 4% é o ponto de partida habitual, não é lei da física."
        />
        <Slider
          id="fire-ret"
          label="Retorno real por ano"
          value={ret}
          min={0}
          max={10}
          step={0.5}
          onChange={setRet}
          hint="Já descontada a inflação, por isso os valores mantêm o poder de compra de hoje."
        />
      </div>

      <div className="rounded-xl border border-hair bg-panel2/40 p-5">
        <p className="eyebrow">Precisas de</p>
        <p className="mt-1 font-display text-4xl font-semibold tracking-tight tnum">
          {formatCents(result.fireNumberCents)}
        </p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-panel2">
          <div
            className="h-full rounded-full bg-credit"
            style={{ width: `${Math.max(0, Math.min(100, result.progressPct))}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-fg-muted">
          Tens {formatCents(netWorthCents)},{" "}
          <span className="text-fg">{Math.max(0, Math.round(result.progressPct))}%</span> do
          caminho.
          {result.remainingCents > 0 ? ` Faltam ${formatCents(result.remainingCents)}.` : " Chegaste lá."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Box
          label="Quando"
          value={
            result.yearsToFire === null
              ? "Nunca, assim"
              : result.yearsToFire === 0
                ? "Agora"
                : `${result.yearsToFire.toFixed(1)} anos`
          }
          hint={
            result.targetYear && result.yearsToFire
              ? `Por volta de ${result.targetYear}`
              : result.yearsToFire === null
                ? "Sem poupança e sem retorno não há caminho"
                : undefined
          }
        />
        <Box
          label="Rendimento hoje"
          value={`${formatCents(result.currentMonthlyIncomeCents)}/mês`}
          hint={`Cobre ${Math.round(result.expensesCoveredPct)}% do que gastas`}
        />
        <Box
          label="Coast FIRE"
          value={formatCents(result.coastNumberCents)}
          hint={
            result.coastReached
              ? "Já podes parar de poupar e deixar render"
              : "Ter isto hoje bastaria, sem poupar mais, para lá chegar em 20 anos"
          }
        />
      </div>
    </div>
  );
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  hint: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}: <span className="text-fg">{value}%</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-fg"
      />
      <p className="mt-1 text-xs text-fg-faint">{hint}</p>
    </div>
  );
}

function Box({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-hair p-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tracking-tight tnum">{value}</p>
      {hint ? <p className="mt-1 text-xs text-fg-faint">{hint}</p> : null}
    </div>
  );
}
