"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { updateExpenseAction, deleteExpenseAction, type ActionState } from "@/app/(app)/actions";
import type { Category } from "@/lib/data";

interface MemberOpt {
  id: string;
  name: string;
}

interface Initial {
  description: string;
  amount: string;
  transactionDate: string;
  categoryId: string;
  payerId: string;
  kind: "shared" | "personal";
  splitType: "EQUAL" | "PERCENT" | "SOLE";
  soleId: string;
  percentA: number;
  visibleToPartner: boolean;
}

const empty: ActionState = {};

export function EditExpenseForm({
  id,
  categories,
  members,
  initial,
  hasReceipt,
}: {
  id: string;
  categories: Category[];
  members: MemberOpt[];
  initial: Initial;
  hasReceipt: boolean;
}) {
  const [state, formAction] = useFormState(updateExpenseAction, empty);

  const [kind, setKind] = useState(initial.kind);
  const [splitType, setSplitType] = useState(initial.splitType);
  const [percentA, setPercentA] = useState(initial.percentA);
  const [soleId, setSoleId] = useState(initial.soleId || members[0]?.id || "");

  const isPair = members.length === 2;
  const a = members[0];
  const b = members[1];

  return (
    <>
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="id" value={id} />
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
              defaultValue={initial.amount}
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
            <input id="description" name="description" type="text" required defaultValue={initial.description} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="transactionDate">Data</label>
              <input id="transactionDate" name="transactionDate" type="date" defaultValue={initial.transactionDate} required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="categoryId">Categoria</label>
              <select id="categoryId" name="categoryId" className="select" defaultValue={initial.categoryId}>
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
                  <input type="radio" name="payerId" value={m.id} defaultChecked={m.id === initial.payerId} className="sr-only" />
                  {m.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="label" htmlFor="receipt">Recibo</label>
              {hasReceipt ? (
                <a href={`/api/receipt/${id}`} target="_blank" rel="noreferrer" className="text-xs text-fg-muted underline-offset-4 hover:text-fg hover:underline">
                  Ver recibo atual ↗
                </a>
              ) : null}
            </div>
            <input
              id="receipt"
              name="receipt"
              type="file"
              accept="image/*,application/pdf"
              className="block w-full text-sm text-fg-muted file:mr-3 file:rounded-lg file:border-0 file:bg-panel2 file:px-3 file:py-2 file:text-sm file:text-fg hover:file:bg-panel2/70"
            />
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-faint">
              {hasReceipt ? "Anexar substitui o atual" : "Foto ou PDF, opcional"}
            </p>
          </div>
        </div>

        <div className="card space-y-5 p-6">
          <div>
            <span className="label">Tipo</span>
            <div className="grid grid-cols-2 gap-2">
              <Toggle active={kind === "shared"} onClick={() => setKind("shared")}>Partilhada</Toggle>
              <Toggle active={kind === "personal"} onClick={() => setKind("personal")}>Pessoal</Toggle>
            </div>
            <input type="hidden" name="kind" value={kind} />
          </div>

          {kind === "shared" ? (
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
                    <span>{a.name}: {percentA}%</span>
                    <span>{b.name}: {100 - percentA}%</span>
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
          ) : (
            <label className="flex items-center gap-3 text-sm text-fg-muted">
              <input type="checkbox" name="visibleToPartner" defaultChecked={initial.visibleToPartner} className="h-4 w-4 rounded border-hair bg-panel2 accent-fg" />
              Tornar visível aos outros participantes
            </label>
          )}
        </div>

        <SubmitButton />
      </form>

      <form action={deleteExpenseAction} className="pt-1">
        <input type="hidden" name="id" value={id} />
        <DeleteButton />
      </form>
    </>
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
    <button type="submit" disabled={pending} className="btn-primary w-full py-3.5 text-base">
      {pending ? "A guardar…" : "Guardar alterações"}
    </button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-ghost w-full text-debt hover:text-debt">
      {pending ? "A apagar…" : "Apagar despesa"}
    </button>
  );
}
