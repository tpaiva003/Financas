"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveIncomeAction, type ActionState } from "@/app/(app)/actions";
import { INCOME_KIND_LABELS, type IncomeKind } from "@/lib/domain";

const empty: ActionState = {};

/**
 * Registar um rendimento.
 *
 * O valor pedido é o LÍQUIDO recebido, não o bruto: é o que se pode gastar, e
 * é sobre isso que a taxa de poupança faz sentido.
 */
export function IncomeForm() {
  const [state, action] = useFormState(saveIncomeAction, empty);
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <details className="card p-5">
      <summary className="cursor-pointer text-sm font-medium text-fg">
        Registar rendimento
      </summary>

      <form action={action} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="inc-desc">Descrição</label>
            <input
              id="inc-desc"
              name="description"
              required
              maxLength={120}
              placeholder="ex.: Ordenado de agosto"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="inc-kind">Tipo</label>
            <select id="inc-kind" name="kind" defaultValue="salario" className="select">
              {(Object.keys(INCOME_KIND_LABELS) as IncomeKind[]).map((k) => (
                <option key={k} value={k}>{INCOME_KIND_LABELS[k]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="inc-amount">Valor recebido (líquido)</label>
            <input id="inc-amount" name="amount" inputMode="decimal" required placeholder="0,00" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="inc-date">Data</label>
            <input id="inc-date" name="date" type="date" defaultValue={hoje} className="input" />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input type="checkbox" name="recurring" className="h-4 w-4 accent-fg" />
          Recebo isto todos os meses
        </label>

        <div>
          <label className="label" htmlFor="inc-notes">Nota (opcional)</label>
          <input id="inc-notes" name="notes" maxLength={300} className="input" />
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
      {pending ? "A gravar…" : "Registar"}
    </button>
  );
}
