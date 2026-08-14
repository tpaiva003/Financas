"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveIncomeAction, type ActionState } from "@/app/(app)/actions";
import { INCOME_KIND_LABELS, type IncomeKind } from "@/lib/domain";

const empty: ActionState = {};

/** Um rendimento já registado, quando isto está a corrigir em vez de a criar. */
export interface RendimentoAEditar {
  id: string;
  kind: string;
  description: string;
  amountCents: number;
  date: string;
  recurring: boolean;
  notes?: string | null;
}

/** Em português, 1234.5 escreve-se 1234,5. */
function decimal(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Registar — ou corrigir — um rendimento.
 *
 * O valor pedido é o LÍQUIDO recebido, não o bruto: é o que se pode gastar, e
 * é sobre isso que a taxa de poupança faz sentido.
 *
 * **O mesmo formulário faz as duas coisas.** Um segundo formulário só para
 * corrigir divergiria do primeiro à primeira alteração — um campo novo aqui que
 * ninguém se lembra de acrescentar lá, e passa a haver rendimentos que só se
 * conseguem criar ou só corrigir. Com `existente` presente, o id viaja num campo
 * escondido e a ação grava por cima em vez de criar.
 */
export function IncomeForm({ existente }: { existente?: RendimentoAEditar } = {}) {
  const [state, action] = useFormState(saveIncomeAction, empty);
  const hoje = new Date().toISOString().slice(0, 10);
  const aCorrigir = Boolean(existente);
  // Os ids dos campos têm de ser únicos na página: com uma lista de
  // rendimentos, cada linha desenha o seu formulário e um `htmlFor` repetido
  // punha o rótulo a apontar para a caixa de outra linha.
  const uid = existente?.id ?? "novo";

  return (
    <details className={aCorrigir ? "" : "card p-5"} open={aCorrigir ? undefined : false}>
      <summary
        className={
          aCorrigir
            ? "cursor-pointer text-xs text-fg-faint hover:text-fg-muted"
            : "cursor-pointer text-sm font-medium text-fg"
        }
      >
        {aCorrigir ? "Corrigir" : "Registar rendimento"}
      </summary>

      <form action={action} className="mt-4 space-y-4">
        {existente ? <input type="hidden" name="id" value={existente.id} /> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`inc-desc-${uid}`}>Descrição</label>
            <input
              id={`inc-desc-${uid}`}
              name="description"
              required
              maxLength={120}
              defaultValue={existente?.description}
              placeholder="ex.: Ordenado de agosto"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor={`inc-kind-${uid}`}>Tipo</label>
            <select
              id={`inc-kind-${uid}`}
              name="kind"
              defaultValue={existente?.kind ?? "salario"}
              className="select"
            >
              {(Object.keys(INCOME_KIND_LABELS) as IncomeKind[]).map((k) => (
                <option key={k} value={k}>{INCOME_KIND_LABELS[k]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`inc-amount-${uid}`}>Valor recebido (líquido)</label>
            <input
              id={`inc-amount-${uid}`}
              name="amount"
              inputMode="decimal"
              required
              defaultValue={existente ? decimal(existente.amountCents) : ""}
              placeholder="0,00"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor={`inc-date-${uid}`}>Data</label>
            <input
              id={`inc-date-${uid}`}
              name="date"
              type="date"
              defaultValue={existente?.date ?? hoje}
              className="input"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            name="recurring"
            defaultChecked={existente?.recurring}
            className="h-4 w-4 accent-fg"
          />
          Recebo isto todos os meses
        </label>

        <div>
          <label className="label" htmlFor={`inc-notes-${uid}`}>Nota (opcional)</label>
          <input
            id={`inc-notes-${uid}`}
            name="notes"
            maxLength={300}
            defaultValue={existente?.notes ?? ""}
            className="input"
          />
        </div>

        {state.error ? (
          <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
            {state.error}
          </p>
        ) : null}
        {state.ok ? <p className="text-sm text-credit">{state.message}</p> : null}

        <SaveButton aCorrigir={aCorrigir} />
      </form>
    </details>
  );
}

function SaveButton({ aCorrigir }: { aCorrigir: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "A gravar…" : aCorrigir ? "Gravar" : "Registar"}
    </button>
  );
}
