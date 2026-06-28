"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createSettlementAction, type ActionState } from "@/app/(app)/actions";

interface UserOpt {
  id: string;
  name: string;
}

const initial: ActionState = {};

export function SettlementForm({
  users,
  today,
  suggested,
}: {
  users: UserOpt[];
  today: string;
  suggested: { fromUserId: string; toUserId: string; amount: string } | null;
}) {
  const [state, formAction] = useFormState(createSettlementAction, initial);

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="fromUserId">
            Quem paga
          </label>
          <select
            id="fromUserId"
            name="fromUserId"
            className="input"
            defaultValue={suggested?.fromUserId ?? users[0]?.id}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="toUserId">
            Quem recebe
          </label>
          <select
            id="toUserId"
            name="toUserId"
            className="input"
            defaultValue={suggested?.toUserId ?? users[1]?.id}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="amount">
            Valor (€)
          </label>
          <input
            id="amount"
            name="amount"
            type="text"
            inputMode="decimal"
            required
            defaultValue={suggested?.amount ?? ""}
            placeholder="0,00"
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="date">
            Data
          </label>
          <input id="date" name="date" type="date" defaultValue={today} required className="input" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="note">
          Nota (opcional)
        </label>
        <input id="note" name="note" type="text" placeholder="Ex.: acerto de junho" className="input" />
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? "A registar…" : "Registar acerto"}
    </button>
  );
}
