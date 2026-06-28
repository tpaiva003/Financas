"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createExpenseAction, type ActionState } from "@/app/(app)/actions";
import type { Category } from "@/lib/data";

interface UserOpt {
  id: string;
  name: string;
}

const initial: ActionState = {};

export function AddExpenseForm({
  categories,
  users,
  currentUserId,
  today,
}: {
  categories: Category[];
  users: UserOpt[];
  currentUserId: string;
  today: string;
}) {
  const [state, formAction] = useFormState(createExpenseAction, initial);

  const [kind, setKind] = useState<"shared" | "personal">("shared");
  const [splitType, setSplitType] = useState<"EQUAL" | "PERCENT">("EQUAL");
  const [percentA, setPercentA] = useState(50);

  const userA = users[0];
  const userB = users[1];

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div className="card p-4">
        <label className="label" htmlFor="amount">
          Valor (€)
        </label>
        <input
          id="amount"
          name="amount"
          type="text"
          inputMode="decimal"
          required
          autoFocus
          placeholder="0,00"
          className="input text-2xl font-semibold"
        />
        <p className="mt-1 text-xs text-slate-400">
          Usa valor negativo para reembolsos/estornos.
        </p>
      </div>

      <div className="card space-y-4 p-4">
        <div>
          <label className="label" htmlFor="description">
            Descrição
          </label>
          <input
            id="description"
            name="description"
            type="text"
            required
            placeholder="Ex.: Continente, jantar…"
            className="input"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="transactionDate">
              Data
            </label>
            <input
              id="transactionDate"
              name="transactionDate"
              type="date"
              defaultValue={today}
              required
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="categoryId">
              Categoria
            </label>
            <select id="categoryId" name="categoryId" className="input" defaultValue="">
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon ? `${c.icon} ` : ""}
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className="label">Quem pagou</span>
          <div className="grid grid-cols-2 gap-2">
            {users.map((u) => (
              <label
                key={u.id}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700"
              >
                <input
                  type="radio"
                  name="payerId"
                  value={u.id}
                  defaultChecked={u.id === currentUserId}
                  className="sr-only"
                />
                {u.name}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="card space-y-4 p-4">
        <div>
          <span className="label">Tipo</span>
          <div className="grid grid-cols-2 gap-2">
            <ToggleButton active={kind === "shared"} onClick={() => setKind("shared")}>
              Partilhada
            </ToggleButton>
            <ToggleButton active={kind === "personal"} onClick={() => setKind("personal")}>
              Pessoal
            </ToggleButton>
          </div>
          <input type="hidden" name="kind" value={kind} />
        </div>

        {kind === "shared" ? (
          <div>
            <span className="label">Como se divide</span>
            <div className="grid grid-cols-2 gap-2">
              <ToggleButton active={splitType === "EQUAL"} onClick={() => setSplitType("EQUAL")}>
                50 / 50
              </ToggleButton>
              <ToggleButton active={splitType === "PERCENT"} onClick={() => setSplitType("PERCENT")}>
                Percentagem
              </ToggleButton>
            </div>
            <input type="hidden" name="splitType" value={splitType} />

            {splitType === "PERCENT" && userA && userB ? (
              <div className="mt-3">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>
                    {userA.name}: {percentA}%
                  </span>
                  <span>
                    {userB.name}: {100 - percentA}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={percentA}
                  onChange={(e) => setPercentA(Number(e.target.value))}
                  className="mt-1 w-full"
                  aria-label={`Percentagem de ${userA.name}`}
                />
                <input type="hidden" name="percentA" value={percentA} />
              </div>
            ) : null}
          </div>
        ) : (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="visibleToPartner" className="h-4 w-4 rounded border-slate-300" />
            Tornar visível ao/à parceiro(a)
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
      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
        active
          ? "border-brand-500 bg-brand-50 text-brand-700"
          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full py-3 text-base">
      {pending ? "A guardar…" : "Guardar despesa"}
    </button>
  );
}
