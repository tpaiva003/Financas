"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { updateRecurringAction, type ActionState } from "@/app/(app)/actions";
import { formatCents } from "@/lib/domain";
import { parseMoneyToCents } from "@/lib/money-input";

interface Opt {
  id: string;
  name: string;
  icon?: string;
}

export interface RecurringEditInitial {
  description: string;
  amount: string; // "12,34" ou ""
  valueType: "fixed" | "variable";
  frequency: "weekly" | "monthly" | "yearly";
  nextDate: string;
  endDate: string; // "" se não tiver
  categoryId: string;
  payerId: string;
  splitType: "EQUAL" | "PERCENT" | "SOLE";
  percentA: number;
  soleId: string;
}

const empty: ActionState = {};

export function EditRecurringForm({
  id,
  categories,
  members,
  initial,
  onClose,
}: {
  id: string;
  categories: Opt[];
  members: Opt[];
  initial: RecurringEditInitial;
  onClose: () => void;
}) {
  const [state, action] = useFormState(updateRecurringAction, empty);

  const [valueType, setValueType] = useState(initial.valueType);
  const [splitType, setSplitType] = useState(initial.splitType);
  const [percentA, setPercentA] = useState(initial.percentA);
  const [soleId, setSoleId] = useState(initial.soleId || members[0]?.id || "");
  const [amountStr, setAmountStr] = useState(initial.amount);

  const amountCents = parseMoneyToCents(amountStr);
  const shareA = Math.round((amountCents * percentA) / 100);
  const shareB = amountCents - shareA;

  const isPair = members.length === 2;
  const a = members[0];
  const b = members[1];

  // Fecha o editor quando a gravação foi bem-sucedida.
  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <form action={action} className="mt-3 space-y-4 rounded-xl border border-hair bg-panel2/40 p-4">
      <input type="hidden" name="id" value={id} />
      {state.error ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          {state.error}
        </p>
      ) : null}

      <div>
        <label className="label" htmlFor={`er-desc-${id}`}>Descrição</label>
        <input id={`er-desc-${id}`} name="description" required maxLength={200} defaultValue={initial.description} className="input" />
      </div>

      <div>
        <span className="label">Tipo de valor</span>
        <div className="grid grid-cols-2 gap-2">
          <Toggle active={valueType === "fixed"} onClick={() => setValueType("fixed")}>Fixo (renda)</Toggle>
          <Toggle active={valueType === "variable"} onClick={() => setValueType("variable")}>Variável (luz/água)</Toggle>
        </div>
        <input type="hidden" name="valueType" value={valueType} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor={`er-amount-${id}`}>
            {valueType === "fixed" ? "Valor" : "Estimativa (opcional)"}
          </label>
          <input
            id={`er-amount-${id}`}
            name="amount"
            inputMode="decimal"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="0,00"
            className="input tnum"
          />
        </div>
        <div>
          <label className="label" htmlFor={`er-freq-${id}`}>Frequência</label>
          <select id={`er-freq-${id}`} name="frequency" defaultValue={initial.frequency} className="select">
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensal</option>
            <option value="yearly">Anual</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor={`er-next-${id}`}>Próxima data</label>
          <input id={`er-next-${id}`} name="nextDate" type="date" defaultValue={initial.nextDate} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor={`er-end-${id}`}>Termina em (opcional)</label>
          <input id={`er-end-${id}`} name="endDate" type="date" defaultValue={initial.endDate} className="input" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor={`er-cat-${id}`}>Categoria</label>
        <select id={`er-cat-${id}`} name="categoryId" defaultValue={initial.categoryId} className="select">
          <option value="">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <span className="label">Quem paga</span>
        <div className={`grid gap-2 ${members.length > 2 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
          {members.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-center justify-center rounded-xl border border-hair px-3 py-2.5 text-sm text-fg-muted transition has-[:checked]:border-fg/40 has-[:checked]:bg-panel2 has-[:checked]:text-fg">
              <input type="radio" name="payerId" value={m.id} defaultChecked={m.id === initial.payerId} className="sr-only" />
              {m.name}
            </label>
          ))}
        </div>
      </div>

      <div>
        <span className="label">Como se divide</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Toggle active={splitType === "EQUAL"} onClick={() => setSplitType("EQUAL")}>
            {isPair ? "50 / 50" : "Partes iguais"}
          </Toggle>
          {isPair ? (
            <Toggle active={splitType === "PERCENT"} onClick={() => setSplitType("PERCENT")}>Percentagem</Toggle>
          ) : null}
          <Toggle active={splitType === "SOLE"} onClick={() => setSplitType("SOLE")}>Só de um(a)</Toggle>
        </div>
        <input type="hidden" name="splitType" value={splitType} />

        {splitType === "PERCENT" && a && b ? (
          <div className="mt-4">
            <div className="flex items-center justify-between font-mono text-xs text-fg-muted">
              <span>{a.name}: {percentA}%{amountCents ? ` · ${formatCents(shareA)}` : ""}</span>
              <span>{b.name}: {100 - percentA}%{amountCents ? ` · ${formatCents(shareB)}` : ""}</span>
            </div>
            <input type="range" min={0} max={100} step={5} value={percentA} onChange={(e) => setPercentA(Number(e.target.value))} className="mt-2 w-full accent-fg" aria-label={`Percentagem de ${a.name}`} />
            <input type="hidden" name="percentA" value={percentA} />
          </div>
        ) : null}

        {splitType === "SOLE" ? (
          <div className="mt-3">
            <p className="mb-2 text-xs text-fg-muted">De quem é, a 100% (mesmo que outro pague):</p>
            <div className="grid grid-cols-2 gap-2">
              {members.map((m) => (
                <label key={m.id} className="flex cursor-pointer items-center justify-center rounded-xl border border-hair px-3 py-2.5 text-sm text-fg-muted transition has-[:checked]:border-fg/40 has-[:checked]:bg-panel2 has-[:checked]:text-fg">
                  <input type="radio" name="soleMemberId" value={m.id} checked={soleId === m.id} onChange={() => setSoleId(m.id)} className="sr-only" />
                  {m.name}
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Alcance da edição: só futuras ou também as já registadas. */}
      <div className="rounded-xl border border-hair bg-bg/40 p-3">
        <span className="label">Aplicar a</span>
        <div className="space-y-2">
          <label className="flex items-start gap-3 text-sm text-fg-muted">
            <input type="radio" name="applyScope" value="future" defaultChecked className="mt-0.5 h-4 w-4 accent-fg" />
            <span>
              <span className="text-fg">Só despesas futuras</span>
              <span className="block text-xs text-fg-faint">As já registadas ficam como estão.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-fg-muted">
            <input type="radio" name="applyScope" value="all" className="mt-0.5 h-4 w-4 accent-fg" />
            <span>
              <span className="text-fg">Também às já registadas</span>
              <span className="block text-xs text-fg-faint">
                Atualiza descrição, categoria, pagador e divisão nas geradas por esta
                recorrente. Valores reais já confirmados nunca são alterados.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <SaveButton />
        <button type="button" onClick={onClose} className="btn-ghost text-sm">Cancelar</button>
      </div>
    </form>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
        active ? "border-fg/40 bg-panel2 text-fg" : "border-hair text-fg-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary text-sm">
      {pending ? "A guardar…" : "Guardar alterações"}
    </button>
  );
}
