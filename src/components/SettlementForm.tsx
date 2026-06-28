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
    <form action={formAction} className="mt-2 space-y-4">
      {state.error ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          {state.error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="fromUserId">Quem paga</label>
          <select id="fromUserId" name="fromUserId" className="select" defaultValue={suggested?.fromUserId ?? users[0]?.id}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="toUserId">Quem recebe</label>
          <select id="toUserId" name="toUserId" className="select" defaultValue={suggested?.toUserId ?? users[1]?.id}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="amount">Valor (€)</label>
          <input id="amount" name="amount" type="text" inputMode="decimal" required defaultValue={suggested?.amount ?? ""} placeholder="0,00" className="input tnum" />
        </div>
        <div>
          <label className="label" htmlFor="date">Data</label>
          <input id="date" name="date" type="date" defaultValue={today} required className="input" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="note">Nota (opcional)</label>
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
