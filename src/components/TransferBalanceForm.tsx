"use client";

import { useFormState, useFormStatus } from "react-dom";
import { transferBalanceToSpaceAction, type ActionState } from "@/app/(app)/actions";

const empty: ActionState = {};

export function TransferBalanceForm({
  spaces,
  balanceLabel,
}: {
  spaces: { id: string; name: string }[];
  balanceLabel: string;
}) {
  const [state, action] = useFormState(transferBalanceToSpaceAction, empty);

  return (
    <form action={action} className="space-y-3">
      {state.error ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          {state.error}
        </p>
      ) : null}
      <p className="text-sm text-fg-muted">
        Em vez de pagar, move o saldo atual ({balanceLabel}) para outro ambiente
        com os mesmos participantes. Aqui fica acertado; lá passa a constar como
        despesa.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select name="targetSpaceId" required defaultValue="" className="select sm:flex-1">
          <option value="" disabled>
            Ambiente destino…
          </option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-secondary shrink-0">
      {pending ? "A transferir…" : "Transferir saldo"}
    </button>
  );
}
