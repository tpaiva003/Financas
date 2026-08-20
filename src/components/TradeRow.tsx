"use client";

/**
 * Um movimento de um investimento, com correção pelo meio.
 *
 * **Porquê editar e não apagar e voltar a escrever.** Uma importação de
 * corretora traz o que o ficheiro tinha, e o ficheiro engana-se: uma data
 * trocada, uma quantidade com um zero a mais, uma taxa de câmbio que não é a
 * que a corretora aplicou. Apagar e reescrever perde a linha original e obriga
 * a saber tudo de cor outra vez.
 *
 * **A correção passa pelas mesmas regras que a criação.** É a mesma ação do
 * servidor, com um `tradeId` a mais: as regras que impedem gravar dólares como
 * euros ou um movimento sem valor valem tanto a criar como a corrigir. Duas
 * validações separadas divergem ao segundo mês.
 */

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  addAssetTradeAction,
  deleteAssetTradeAction,
  type ActionState,
} from "@/app/(app)/actions";
import {
  FX_CURRENCIES,
  TRADE_KIND_LABELS,
  formatCents,
  formatRate,
  lucroDoMovimento,
  type FxCurrency,
  type TradeKind,
} from "@/lib/domain";

const empty: ActionState = {};

export interface TradeRowData {
  id: string;
  date: string;
  kind: string;
  quantity?: number | null;
  amountCents: number;
  currency?: string | null;
  originalAmountCents?: number | null;
  fxRate?: number | null;
  notes?: string | null;
}

function decimal(cents?: number | null): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-PT");
}

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary text-xs" disabled={pending}>
      {pending ? "A gravar…" : "Guardar"}
    </button>
  );
}

export function TradeRow({
  trade: t,
  assetId,
  /** O preço por unidade de hoje, para se dizer o que a entrada valeu a pena. */
  unitPriceCents,
}: {
  trade: TradeRowData;
  assetId: string;
  unitPriceCents?: number | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [state, guardar] = useFormState(addAssetTradeAction, empty);
  const [moeda, setMoeda] = useState<FxCurrency>(
    (t.currency as FxCurrency) && FX_CURRENCIES.includes(t.currency as FxCurrency)
      ? (t.currency as FxCurrency)
      : "EUR",
  );

  const estrangeira = moeda !== "EUR";
  const lucro = lucroDoMovimento(
    { kind: t.kind as TradeKind, quantity: t.quantity ?? null, amountCents: t.amountCents },
    unitPriceCents,
  );
  const entrada = t.kind === "compra" || t.kind === "custo";

  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">
            {TRADE_KIND_LABELS[t.kind as TradeKind] ?? t.kind}
            {t.quantity ? (
              <span className="ml-2 font-mono text-xs text-fg-muted">{t.quantity} un.</span>
            ) : null}
          </p>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
            {fmtDate(t.date)}
            {t.currency && t.originalAmountCents && t.fxRate
              ? ` · ${decimal(t.originalAmountCents)} ${t.currency} a ${formatRate(t.fxRate)}`
              : ""}
          </p>
          {t.notes ? <p className="mt-1 text-xs text-fg-faint">{t.notes}</p> : null}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-right">
            <span className={`block font-mono text-sm tnum ${entrada ? "text-fg" : "text-credit"}`}>
              {entrada ? "" : "+"}
              <span className="dinheiro">{formatCents(t.amountCents)}</span>
            </span>
            {/*
              O que esta entrada valeu a pena até hoje. Não é FIFO nem
              mais-valia realizada — a posição desta app é a custo médio, e
              misturar as duas contabilidades no mesmo ecrã seria a de baixo a
              contradizer a de cima.
            */}
            {lucro ? (
              <span
                className={`block font-mono text-[11px] tnum ${lucro.gainCents >= 0 ? "text-credit" : "text-debt"}`}
                title={`Estas ${t.quantity} un. ${lucro.kind === "compra" ? "valem" : "valeriam"} hoje ${formatCents(lucro.nowCents)}.`}
              >
                {lucro.gainCents >= 0 ? "+" : ""}
                <span className="dinheiro">{formatCents(lucro.gainCents)}</span>
                {lucro.gainPct !== null
                  ? ` (${lucro.gainCents >= 0 ? "+" : ""}${Math.round(lucro.gainPct)}%)`
                  : ""}
              </span>
            ) : null}
          </span>

          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            className="btn-ghost px-2 text-xs"
          >
            {aberto ? "Fechar" : "Editar"}
          </button>

          <form action={deleteAssetTradeAction}>
            <input type="hidden" name="id" value={t.id} />
            <button type="submit" className="btn-ghost px-2 text-xs text-debt hover:text-debt">
              Remover
            </button>
          </form>
        </div>
      </div>

      {aberto ? (
        <form action={guardar} className="mt-3 rounded-xl border border-hair bg-panel2/30 p-4">
          <input type="hidden" name="assetId" value={assetId} />
          <input type="hidden" name="tradeId" value={t.id} />

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor={`t-date-${t.id}`}>Data</label>
              <input
                id={`t-date-${t.id}`}
                name="date"
                type="date"
                defaultValue={t.date}
                required
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor={`t-kind-${t.id}`}>Tipo</label>
              <select id={`t-kind-${t.id}`} name="kind" defaultValue={t.kind} className="select">
                {(Object.keys(TRADE_KIND_LABELS) as TradeKind[]).map((k) => (
                  <option key={k} value={k}>{TRADE_KIND_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor={`t-qty-${t.id}`}>Unidades</label>
              <input
                id={`t-qty-${t.id}`}
                name="quantity"
                inputMode="decimal"
                defaultValue={t.quantity ? String(t.quantity).replace(".", ",") : ""}
                className="input"
              />
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor={`t-amount-${t.id}`}>
                Valor{estrangeira ? ` (em ${moeda})` : ""}
              </label>
              <input
                id={`t-amount-${t.id}`}
                name="amount"
                inputMode="decimal"
                // Numa moeda estrangeira, o que se edita é o valor ORIGINAL: é
                // o que está na nota da corretora. O euro sai da taxa, como na
                // criação — senão o valor e o câmbio deixavam de bater certo.
                defaultValue={decimal(estrangeira ? t.originalAmountCents : t.amountCents)}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor={`t-ccy-${t.id}`}>Moeda</label>
              <select
                id={`t-ccy-${t.id}`}
                name="currency"
                value={moeda}
                onChange={(e) => setMoeda(e.target.value as FxCurrency)}
                className="select"
              >
                {FX_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            {estrangeira ? (
              <div>
                <label className="label" htmlFor={`t-fx-${t.id}`}>Taxa aplicada</label>
                <input
                  id={`t-fx-${t.id}`}
                  name="fxRate"
                  inputMode="decimal"
                  defaultValue={t.fxRate ? formatRate(t.fxRate) : ""}
                  className="input"
                />
                <p className="mt-1 text-xs text-fg-faint">
                  A da corretora, não a do BCE: é a que saiu da conta.
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-3">
            <label className="label" htmlFor={`t-notes-${t.id}`}>Nota (opcional)</label>
            <input
              id={`t-notes-${t.id}`}
              name="notes"
              maxLength={300}
              defaultValue={t.notes ?? ""}
              className="input"
            />
          </div>

          {state.error ? (
            <p role="alert" className="mt-3 text-xs text-debt">{state.error}</p>
          ) : null}
          {state.ok ? <p className="mt-3 text-xs text-credit">{state.message}</p> : null}

          <div className="mt-3">
            <Guardar />
          </div>
        </form>
      ) : null}
    </li>
  );
}
