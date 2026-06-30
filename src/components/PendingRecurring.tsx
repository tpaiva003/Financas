"use client";

import { useFormState, useFormStatus } from "react-dom";
import { confirmRecurringExpenseAction, type ActionState } from "@/app/(app)/actions";

export interface PendingItem {
  id: string;
  description: string;
  date: string;
  categoryName: string;
  payerName: string;
  estimate: string; // valor pré-preenchido (ex.: "12,34") ou ""
}

const empty: ActionState = {};

export function PendingRecurring({ items }: { items: PendingItem[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="eyebrow mb-2">
        Por confirmar <span className="text-debt">· {items.length}</span>
      </h2>
      <ul className="space-y-3">
        {items.map((it) => (
          <PendingRow key={it.id} item={it} />
        ))}
      </ul>
    </section>
  );
}

function PendingRow({ item }: { item: PendingItem }) {
  const [state, action] = useFormState(confirmRecurringExpenseAction, empty);
  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-fg">{item.description}</p>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
            {new Date(item.date).toLocaleDateString("pt-PT")} · {item.categoryName} · paga {item.payerName}
          </p>
        </div>
        <span className="chip border-debt/30 text-debt">Pendente</span>
      </div>
      <form action={action} className="mt-3 flex items-end gap-2">
        <input type="hidden" name="id" value={item.id} />
        <div className="flex-1">
          <label className="label" htmlFor={`amt-${item.id}`}>Valor real (€)</label>
          <input
            id={`amt-${item.id}`}
            name="amount"
            inputMode="decimal"
            required
            defaultValue={item.estimate}
            placeholder="0,00"
            className="input tnum"
          />
        </div>
        <ConfirmButton />
      </form>
      {state.error ? <p role="alert" className="mt-1 text-xs text-debt">{state.error}</p> : null}
    </li>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary shrink-0">
      {pending ? "…" : "Confirmar"}
    </button>
  );
}
