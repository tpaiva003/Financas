"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { addAssetTradeAction, type ActionState } from "@/app/(app)/actions";
import {
  FX_CURRENCIES,
  TRADE_KIND_LABELS,
  formatCents,
  formatRate,
  toEurCents,
  type FxCurrency,
  type TradeKind,
} from "@/lib/domain";

const empty: ActionState = {};

function parse(value: string): number | null {
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Registar um movimento de um investimento.
 *
 * Compras e vendas pedem unidades; dividendos e comissões pedem só o valor.
 *
 * A parte do câmbio é a que exige mais cuidado. A taxa de referência do BCE e a
 * taxa que a corretora aplicou não são o mesmo número: a segunda tem spread, e
 * é essa que saiu da conta. Por isso o formulário deixa **escolher**: buscar a
 * do dia, ou escrever a que veio na nota de execução. E mostra sempre o valor em
 * euros que vai ficar gravado, para se conferir antes de gravar em vez de
 * descobrir depois.
 */
export function TradeForm({ assetId, assetName }: { assetId: string; assetName: string }) {
  const [state, action] = useFormState(addAssetTradeAction, empty);
  const [kind, setKind] = useState<TradeKind>("compra");
  const [currency, setCurrency] = useState<FxCurrency>("EUR");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [rateNote, setRateNote] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const hasUnits = kind === "compra" || kind === "venda";
  const foreign = currency !== "EUR";
  const amountValue = parse(amount);
  const rateValue = parse(rate);
  const eurPreview =
    foreign && amountValue !== null && rateValue !== null && rateValue > 0
      ? toEurCents(Math.round(amountValue * 100), rateValue)
      : null;

  async function fetchRate() {
    setFetching(true);
    setRateNote(null);
    try {
      const params = new URLSearchParams({ currency });
      if (date) params.set("date", date);
      const res = await fetch(`/api/fx?${params}`);
      const body = await res.json();
      if (!res.ok || typeof body.rate !== "number") {
        setRateNote(body.error ?? "Não consegui obter a taxa. Escreve a que te aplicaram.");
        return;
      }
      setRate(formatRate(body.rate));
      setRateNote(
        `Taxa de referência do BCE de ${new Date(`${body.date}T00:00:00Z`).toLocaleDateString("pt-PT")}. Se a corretora aplicou outra, escreve a dela.`,
      );
    } catch {
      setRateNote("Não consegui obter a taxa. Escreve a que te aplicaram.");
    } finally {
      setFetching(false);
    }
  }

  return (
    <details className="card p-5">
      <summary className="cursor-pointer text-sm font-medium text-fg">Registar movimento</summary>

      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="assetId" value={assetId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="trade-kind">O que foi</label>
            <select
              id="trade-kind"
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as TradeKind)}
              className="select"
            >
              {(Object.keys(TRADE_KIND_LABELS) as TradeKind[]).map((k) => (
                <option key={k} value={k}>{TRADE_KIND_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="trade-date">Data</label>
            <input
              id="trade-date"
              name="date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {hasUnits ? (
            <div>
              <label className="label" htmlFor="trade-qty">Unidades</label>
              <input id="trade-qty" name="quantity" inputMode="decimal" placeholder="10" className="input" />
            </div>
          ) : null}
          <div>
            <label className="label" htmlFor="trade-amount">
              Valor total{foreign ? ` (${currency})` : ""}
            </label>
            <input
              id="trade-amount"
              name="amount"
              inputMode="decimal"
              placeholder="1000,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="trade-currency">Moeda</label>
            <select
              id="trade-currency"
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as FxCurrency)}
              className="select"
            >
              {FX_CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {foreign ? (
          <div className="rounded-xl border border-hair bg-panel2/30 p-4">
            <p className="label mb-1">Câmbio</p>
            <p className="mb-3 text-xs text-fg-faint">
              Quantos {currency} por euro. Podes ir buscar a taxa de referência do
              dia, ou escrever a que a corretora te aplicou, que é a que saiu
              mesmo da conta e costuma trazer spread.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[9rem]">
                <label className="label" htmlFor="trade-fx">Taxa</label>
                <input
                  id="trade-fx"
                  name="fxRate"
                  inputMode="decimal"
                  placeholder="1,0912"
                  value={rate}
                  onChange={(e) => {
                    setRate(e.target.value);
                    setRateNote(null);
                  }}
                  className="input"
                />
              </div>
              <button
                type="button"
                onClick={fetchRate}
                disabled={fetching}
                className="btn-ghost h-11 shrink-0 px-3 text-xs"
              >
                {fetching ? "A buscar…" : "Taxa do dia"}
              </button>
            </div>
            {rateNote ? <p className="mt-2 text-xs text-fg-muted">{rateNote}</p> : null}
            {eurPreview !== null ? (
              <p className="mt-2 text-sm text-fg">
                Fica gravado como <span className="tnum">{formatCents(eurPreview)}</span>.
              </p>
            ) : null}
          </div>
        ) : null}

        <div>
          <label className="label" htmlFor="trade-notes">Nota (opcional)</label>
          <input id="trade-notes" name="notes" maxLength={300} className="input" />
        </div>

        {state.error ? (
          <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
            {state.error}
          </p>
        ) : null}
        {state.ok ? <p className="text-sm text-credit">{state.message}</p> : null}

        <SaveButton name={assetName} />
      </form>
    </details>
  );
}

function SaveButton({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "A gravar…" : `Registar em ${name}`}
    </button>
  );
}
