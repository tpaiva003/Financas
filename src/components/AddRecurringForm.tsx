"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createRecurringAction, type ActionState } from "@/app/(app)/actions";
import { formatCents } from "@/lib/domain";
import { parseMoneyToCents } from "@/lib/money-input";
import type { Category } from "@/lib/data";

interface MemberOpt {
  id: string;
  name: string;
}

const initial: ActionState = {};

export function AddRecurringForm({
  categories,
  members,
  currentMemberId,
  today,
}: {
  categories: Category[];
  members: MemberOpt[];
  currentMemberId: string;
  today: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action] = useFormState(createRecurringAction, initial);

  const [valueType, setValueType] = useState<"fixed" | "variable">("fixed");
  const [splitType, setSplitType] = useState<"EQUAL" | "PERCENT" | "SOLE">("EQUAL");
  const [percentA, setPercentA] = useState(50);
  const [soleId, setSoleId] = useState(members[0]?.id ?? "");
  const [amountStr, setAmountStr] = useState("");

  const amountCents = parseMoneyToCents(amountStr);
  const shareA = Math.round((amountCents * percentA) / 100);
  const shareB = amountCents - shareA;

  const isPair = members.length === 2;
  const a = members[0];
  const b = members[1];

  // Limpa o formulário após criar com sucesso.
  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setValueType("fixed");
      setSplitType("EQUAL");
      setPercentA(50);
      setAmountStr("");
    }
  }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-4">
      {state.error ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          {state.error}
        </p>
      ) : null}

      <div>
        <label className="label" htmlFor="r-desc">Descrição</label>
        <input id="r-desc" name="description" required maxLength={200} placeholder="Ex.: Renda, Luz, Água…" className="input" />
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
          <label className="label" htmlFor="r-amount">
            {valueType === "fixed" ? "Valor" : "Estimativa (opcional)"}
          </label>
          <input id="r-amount" name="amount" inputMode="decimal" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} placeholder="0,00" className="input tnum" />
        </div>
        <div>
          <label className="label" htmlFor="r-freq">Frequência</label>
          <select id="r-freq" name="frequency" defaultValue="monthly" className="select">
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensal</option>
            <option value="yearly">Anual</option>
          </select>
        </div>
      </div>
      {valueType === "variable" ? (
        <p className="-mt-2 font-mono text-[10px] uppercase tracking-[0.04em] text-fg-faint">
          A despesa é criada pendente e só entra no saldo após confirmares o valor real.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="r-next">Próxima data</label>
          <input id="r-next" name="nextDate" type="date" defaultValue={today} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="r-end">Termina em (opcional)</label>
          <input id="r-end" name="endDate" type="date" className="input" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="r-cat">Categoria</label>
        <select id="r-cat" name="categoryId" defaultValue="" className="select">
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
              <input type="radio" name="payerId" value={m.id} defaultChecked={m.id === currentMemberId} className="sr-only" />
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

      <SubmitButton />
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? "A criar…" : "Criar recorrente"}
    </button>
  );
}
