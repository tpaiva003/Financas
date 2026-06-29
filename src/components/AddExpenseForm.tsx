"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createExpenseAction, type ActionState } from "@/app/(app)/actions";
import type { Category } from "@/lib/data";

interface MemberOpt {
  id: string;
  name: string;
}

const initial: ActionState = {};

export function AddExpenseForm({
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
  const [state, formAction] = useFormState(createExpenseAction, initial);

  const [kind, setKind] = useState<"shared" | "personal">("shared");
  const [splitType, setSplitType] = useState<"EQUAL" | "PERCENT">("EQUAL");
  const [percentA, setPercentA] = useState(50);

  const isPair = members.length === 2;
  const a = members[0];
  const b = members[1];

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          {state.error}
        </p>
      ) : null}

      <div className="card p-6">
        <label className="label" htmlFor="amount">Valor</label>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-3xl text-fg-faint">€</span>
          <input
            id="amount"
            name="amount"
            type="text"
            inputMode="decimal"
            required
            autoFocus
            placeholder="0,00"
            className="w-full border-0 bg-transparent p-0 font-display text-5xl font-semibold tracking-tight tnum text-fg placeholder:text-fg-faint/40 focus:outline-none focus:ring-0"
          />
        </div>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
          Valor negativo = reembolso / estorno
        </p>
      </div>

      <div className="card space-y-5 p-6">
        <div>
          <label className="label" htmlFor="description">Descrição</label>
          <input id="description" name="description" type="text" required placeholder="Ex.: Continente, jantar…" className="input" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="transactionDate">Data</label>
            <input id="transactionDate" name="transactionDate" type="date" defaultValue={today} required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="categoryId">Categoria</label>
            <select id="categoryId" name="categoryId" className="select" defaultValue="">
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon ? `${c.icon} ` : ""}{c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className="label">Quem pagou</span>
          <div className={`grid gap-2 ${members.length > 2 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
            {members.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-hair px-3 py-2.5 text-sm text-fg-muted transition has-[:checked]:border-fg/40 has-[:checked]:bg-panel2 has-[:checked]:text-fg"
              >
                <input
                  type="radio"
                  name="payerId"
                  value={m.id}
                  defaultChecked={m.id === currentMemberId}
                  className="sr-only"
                />
                {m.name}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="card space-y-5 p-6">
        <div>
          <span className="label">Tipo</span>
          <div className="grid grid-cols-2 gap-2">
            <ToggleButton active={kind === "shared"} onClick={() => setKind("shared")}>Partilhada</ToggleButton>
            <ToggleButton active={kind === "personal"} onClick={() => setKind("personal")}>Pessoal</ToggleButton>
          </div>
          <input type="hidden" name="kind" value={kind} />
        </div>

        {kind === "shared" ? (
          <div>
            <span className="label">Como se divide</span>
            {isPair ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <ToggleButton active={splitType === "EQUAL"} onClick={() => setSplitType("EQUAL")}>50 / 50</ToggleButton>
                  <ToggleButton active={splitType === "PERCENT"} onClick={() => setSplitType("PERCENT")}>Percentagem</ToggleButton>
                </div>
                <input type="hidden" name="splitType" value={splitType} />
                {splitType === "PERCENT" && a && b ? (
                  <div className="mt-4">
                    <div className="flex items-center justify-between font-mono text-xs text-fg-muted">
                      <span>{a.name}: {percentA}%</span>
                      <span>{b.name}: {100 - percentA}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={percentA}
                      onChange={(e) => setPercentA(Number(e.target.value))}
                      className="mt-2 w-full accent-fg"
                      aria-label={`Percentagem de ${a.name}`}
                    />
                    <input type="hidden" name="percentA" value={percentA} />
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p className="rounded-xl border border-hair bg-panel2/50 px-3 py-2.5 text-sm text-fg-muted">
                  Dividido em partes iguais por {members.length} participantes.
                </p>
                <input type="hidden" name="splitType" value="EQUAL" />
              </>
            )}
          </div>
        ) : (
          <label className="flex items-center gap-3 text-sm text-fg-muted">
            <input type="checkbox" name="visibleToPartner" className="h-4 w-4 rounded border-hair bg-panel2 accent-fg" />
            Tornar visível aos outros participantes
          </label>
        )}
      </div>

      <SubmitButton />
    </form>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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
    <button type="submit" disabled={pending} className="btn-primary w-full py-3.5 text-base">
      {pending ? "A guardar…" : "Guardar despesa"}
    </button>
  );
}
