"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { saveAssetAction, type ActionState } from "@/app/(app)/actions";
import { ASSET_KIND_LABELS, type AssetKind } from "@/lib/domain";

const empty: ActionState = {};

/**
 * Adicionar um bem, investimento ou dívida.
 *
 * Os investimentos pedem quantidade e preços por unidade; tudo o resto pede só
 * o valor. O preço atual fica opcional de propósito: sem ele, o investimento
 * conta pelo que custou, em vez de aparecer uma valorização inventada.
 */
export function AssetForm() {
  const [state, action] = useFormState(saveAssetAction, empty);
  const [kind, setKind] = useState<AssetKind>("conta");
  const isInvestment = kind === "investimento";

  return (
    <details className="card p-5">
      <summary className="cursor-pointer text-sm font-medium text-fg">
        Adicionar ao património
      </summary>

      <form action={action} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="asset-name">Nome</label>
            <input
              id="asset-name"
              name="name"
              required
              maxLength={120}
              placeholder={isInvestment ? "ex.: VWCE" : "ex.: Depósito a prazo"}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="asset-kind">Tipo</label>
            <select
              id="asset-kind"
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as AssetKind)}
              className="select"
            >
              {(Object.keys(ASSET_KIND_LABELS) as AssetKind[]).map((k) => (
                <option key={k} value={k}>{ASSET_KIND_LABELS[k]}</option>
              ))}
            </select>
          </div>
        </div>

        {isInvestment ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="asset-qty">Unidades</label>
              <input id="asset-qty" name="quantity" inputMode="decimal" placeholder="100" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="asset-cost">Preço de compra (por unidade)</label>
              <input id="asset-cost" name="unitCost" inputMode="decimal" placeholder="100,00" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="asset-price">Preço atual (opcional)</label>
              <input id="asset-price" name="unitPrice" inputMode="decimal" placeholder="125,00" className="input" />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="asset-value">
                {kind === "divida" ? "Quanto falta pagar" : "Valor atual"}
              </label>
              <input id="asset-value" name="value" inputMode="decimal" placeholder="0,00" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="asset-date">Data (opcional)</label>
              <input id="asset-date" name="purchasedAt" type="date" className="input" />
            </div>
          </div>
        )}

        {isInvestment ? (
          <div>
            <label className="label" htmlFor="asset-date-inv">Data de compra (opcional)</label>
            <input id="asset-date-inv" name="purchasedAt" type="date" className="input sm:max-w-xs" />
          </div>
        ) : null}

        <div>
          <label className="label" htmlFor="asset-notes">Nota (opcional)</label>
          <input id="asset-notes" name="notes" maxLength={300} className="input" />
        </div>

        {state.error ? (
          <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
            {state.error}
          </p>
        ) : null}
        {state.ok ? <p className="text-sm text-credit">{state.message}</p> : null}

        <SaveButton />
      </form>
    </details>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "A gravar…" : "Adicionar"}
    </button>
  );
}
