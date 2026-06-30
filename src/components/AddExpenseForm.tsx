"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createExpenseAction, type ActionState } from "@/app/(app)/actions";
import { CategoryCombobox } from "@/components/CategoryCombobox";
import { formatCents } from "@/lib/domain";
import { parseMoneyToCents } from "@/lib/money-input";
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
  descriptions = [],
  isSubmitter = false,
  approvers = [],
}: {
  categories: Category[];
  members: MemberOpt[];
  currentMemberId: string;
  today: string;
  descriptions?: string[];
  /** O autor é um "submitter": despesa fica pendente de aprovação. */
  isSubmitter?: boolean;
  /** Membros plenos que podem aprovar (quando submitter). */
  approvers?: MemberOpt[];
}) {
  const [state, formAction] = useFormState(createExpenseAction, initial);

  const [kind, setKind] = useState<"shared" | "personal">("shared");
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
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
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
          <input
            id="description"
            name="description"
            type="text"
            required
            list="desc-suggestions"
            autoComplete="off"
            placeholder="Ex.: Continente, jantar…"
            className="input"
          />
          {descriptions.length > 0 ? (
            <datalist id="desc-suggestions">
              {descriptions.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="transactionDate">Data</label>
            <input id="transactionDate" name="transactionDate" type="date" defaultValue={today} required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="categoryId">Categoria</label>
            <CategoryCombobox categories={categories} />
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

        <div>
          <label className="label" htmlFor="receipt">Recibo (opcional)</label>
          <input
            id="receipt"
            name="receipt"
            type="file"
            accept="image/*,application/pdf"
            className="block w-full text-sm text-fg-muted file:mr-3 file:rounded-lg file:border-0 file:bg-panel2 file:px-3 file:py-2 file:text-sm file:text-fg hover:file:bg-panel2/70"
          />
        </div>
      </div>

      <div className="card space-y-5 p-6">
        {isSubmitter ? (
          <input type="hidden" name="kind" value="shared" />
        ) : (
          <div>
            <span className="label">Tipo</span>
            <div className="grid grid-cols-2 gap-2">
              <ToggleButton active={kind === "shared"} onClick={() => setKind("shared")}>Partilhada</ToggleButton>
              <ToggleButton active={kind === "personal"} onClick={() => setKind("personal")}>Pessoal</ToggleButton>
            </div>
            <input type="hidden" name="kind" value={kind} />
          </div>
        )}

        {isSubmitter || kind === "shared" ? (
          <div>
            <span className="label">Como se divide</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ToggleButton active={splitType === "EQUAL"} onClick={() => setSplitType("EQUAL")}>
                {isPair ? "50 / 50" : "Partes iguais"}
              </ToggleButton>
              {isPair ? (
                <ToggleButton active={splitType === "PERCENT"} onClick={() => setSplitType("PERCENT")}>
                  Percentagem
                </ToggleButton>
              ) : null}
              <ToggleButton active={splitType === "SOLE"} onClick={() => setSplitType("SOLE")}>
                Só de um(a)
              </ToggleButton>
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
        ) : (
          <label className="flex items-center gap-3 text-sm text-fg-muted">
            <input type="checkbox" name="visibleToPartner" className="h-4 w-4 rounded border-hair bg-panel2 accent-fg" />
            Tornar visível aos outros participantes
          </label>
        )}

        {isSubmitter ? (
          <div className="border-t border-hair pt-4">
            <label className="label" htmlFor="approverId">Quem aprova</label>
            <p className="mb-2 text-xs text-fg-muted">
              A despesa fica pendente até este participante a aprovar.
            </p>
            <select id="approverId" name="approverId" required defaultValue="" className="select">
              <option value="" disabled>Escolhe o aprovador…</option>
              {approvers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        ) : null}
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
