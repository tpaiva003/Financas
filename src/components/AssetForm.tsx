"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { saveAssetAction, type ActionState } from "@/app/(app)/actions";
import { ASSET_KIND_LABELS, RATE_KIND_LABELS, type AssetKind, type RateKind } from "@/lib/domain";

const empty: ActionState = {};

/** O que o formulário precisa de saber para editar um bem já registado. */
export interface AssetFormValues {
  id: string;
  name: string;
  kind: AssetKind;
  quantity?: number | null;
  unitCostCents?: number | null;
  unitPriceCents?: number | null;
  valueCents?: number | null;
  purchasedAt?: string | null;
  notes?: string | null;
  interestRatePct?: number | null;
  monthlyPaymentCents?: number | null;
  termMonths?: number | null;
  rateKind?: string | null;
  symbol?: string | null;
}

/** Cêntimos para o texto que se escreve num campo: 123456 dá "1234,56". */
function decimal(cents?: number | null): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

function plain(n?: number | null): string {
  if (n === null || n === undefined) return "";
  return String(n).replace(".", ",");
}

/**
 * Registar ou editar um bem, investimento ou dívida.
 *
 * Os investimentos pedem quantidade e preços por unidade; tudo o resto pede só
 * o valor. O preço atual fica opcional de propósito: sem ele, o investimento
 * conta pelo que custou, em vez de aparecer uma valorização inventada.
 *
 * A taxa de juro aparece dos dois lados, porque é a mesma pergunta vista ao
 * contrário: num depósito diz o que rende, numa dívida diz o que custa. Só as
 * dívidas pedem prestação e prazo, que é o que dá a data do último pagamento.
 */
export function AssetForm({ asset }: { asset?: AssetFormValues }) {
  const [state, action] = useFormState(saveAssetAction, empty);
  const [kind, setKind] = useState<AssetKind>(asset?.kind ?? "conta");
  const isInvestment = kind === "investimento";
  const isDebt = kind === "divida";
  const editing = Boolean(asset);
  const uid = asset?.id ?? "novo";

  const form = (
    <form action={action} className={editing ? "space-y-4" : "mt-4 space-y-4"}>
      {asset ? <input type="hidden" name="id" value={asset.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`asset-name-${uid}`}>Nome</label>
          <input
            id={`asset-name-${uid}`}
            name="name"
            required
            maxLength={120}
            defaultValue={asset?.name ?? ""}
            placeholder={isInvestment ? "ex.: VWCE" : "ex.: Depósito a prazo"}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor={`asset-kind-${uid}`}>Tipo</label>
          <select
            id={`asset-kind-${uid}`}
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
            <label className="label" htmlFor={`asset-qty-${uid}`}>Unidades</label>
            <input
              id={`asset-qty-${uid}`}
              name="quantity"
              inputMode="decimal"
              defaultValue={plain(asset?.quantity)}
              placeholder="100"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor={`asset-cost-${uid}`}>Preço de compra (por unidade)</label>
            <input
              id={`asset-cost-${uid}`}
              name="unitCost"
              inputMode="decimal"
              defaultValue={decimal(asset?.unitCostCents)}
              placeholder="100,00"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor={`asset-price-${uid}`}>Preço atual (opcional)</label>
            <input
              id={`asset-price-${uid}`}
              name="unitPrice"
              inputMode="decimal"
              defaultValue={decimal(asset?.unitPriceCents)}
              placeholder="125,00"
              className="input"
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`asset-value-${uid}`}>
              {isDebt ? "Quanto falta pagar" : "Valor atual"}
            </label>
            <input
              id={`asset-value-${uid}`}
              name="value"
              inputMode="decimal"
              defaultValue={decimal(asset?.valueCents)}
              placeholder="0,00"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor={`asset-date-${uid}`}>
              {isDebt ? "Data de início (opcional)" : "Data (opcional)"}
            </label>
            <input
              id={`asset-date-${uid}`}
              name="purchasedAt"
              type="date"
              defaultValue={asset?.purchasedAt ?? ""}
              className="input"
            />
          </div>
        </div>
      )}

      {isInvestment ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`asset-date-inv-${uid}`}>Data de compra (opcional)</label>
            <input
              id={`asset-date-inv-${uid}`}
              name="purchasedAt"
              type="date"
              defaultValue={asset?.purchasedAt ?? ""}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor={`asset-symbol-${uid}`}>Símbolo na bolsa (opcional)</label>
            <input
              id={`asset-symbol-${uid}`}
              name="symbol"
              maxLength={20}
              defaultValue={asset?.symbol ?? ""}
              placeholder="vwce.de"
              className="input"
            />
            <p className="mt-1 text-xs text-fg-faint">
              Com o símbolo, o preço atual passa a poder ser buscado sozinho. O
              sufixo é a praça: <span className="text-fg-muted">.de</span> para a
              Xetra, <span className="text-fg-muted">.uk</span> para Londres,{" "}
              <span className="text-fg-muted">.us</span> para os Estados Unidos.
            </p>
          </div>
        </div>
      ) : null}

      {/* Taxa: em investimentos o retorno vem do preço, não de uma taxa. */}
      {isInvestment ? null : (
        <div className="rounded-xl border border-hair bg-panel2/30 p-4">
          <p className="label mb-1">{isDebt ? "Plano de pagamento" : "Rendimento"}</p>
          <p className="mb-3 text-xs text-fg-faint">
            {isDebt
              ? "Com a taxa e a prestação, a app diz-te quando acaba e quanto pagas de juros até lá."
              : "Se render juros, diz a taxa e passamos a mostrar o que este dinheiro dá por ano."}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`asset-rate-${uid}`}>
                Taxa anual (%){isDebt ? "" : ", opcional"}
              </label>
              <input
                id={`asset-rate-${uid}`}
                name="interestRatePct"
                inputMode="decimal"
                defaultValue={plain(asset?.interestRatePct)}
                placeholder={isDebt ? "3,4" : "2,5"}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor={`asset-ratekind-${uid}`}>Tipo de taxa</label>
              <select
                id={`asset-ratekind-${uid}`}
                name="rateKind"
                defaultValue={asset?.rateKind ?? ""}
                className="select"
              >
                <option value="">Não indicado</option>
                {(Object.keys(RATE_KIND_LABELS) as RateKind[]).map((k) => (
                  <option key={k} value={k}>{RATE_KIND_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </div>

          {isDebt ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={`asset-payment-${uid}`}>Prestação mensal</label>
                <input
                  id={`asset-payment-${uid}`}
                  name="monthlyPayment"
                  inputMode="decimal"
                  defaultValue={decimal(asset?.monthlyPaymentCents)}
                  placeholder="632,00"
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor={`asset-term-${uid}`}>Meses que faltam</label>
                <input
                  id={`asset-term-${uid}`}
                  name="termMonths"
                  inputMode="numeric"
                  defaultValue={plain(asset?.termMonths)}
                  placeholder="360"
                  className="input"
                />
                <p className="mt-1 text-xs text-fg-faint">
                  Basta um dos dois. Se indicares os dois, manda a prestação.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <div>
        <label className="label" htmlFor={`asset-notes-${uid}`}>Nota (opcional)</label>
        <input
          id={`asset-notes-${uid}`}
          name="notes"
          maxLength={300}
          defaultValue={asset?.notes ?? ""}
          className="input"
        />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-sm text-credit">{state.message}</p> : null}

      <SaveButton editing={editing} />
    </form>
  );

  if (editing) return form;

  return (
    <details className="card p-5">
      <summary className="cursor-pointer text-sm font-medium text-fg">
        Adicionar ao património
      </summary>
      {form}
    </details>
  );
}

function SaveButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "A gravar…" : editing ? "Guardar" : "Adicionar"}
    </button>
  );
}
