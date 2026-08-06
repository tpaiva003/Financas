"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  removeAccountAccessAction,
  deleteAccountDataAction,
  type ActionState,
} from "@/app/(app)/actions";
import type { AppUser } from "@/lib/data";

const empty: ActionState = {};

/**
 * Uma conta na consola, com as duas formas de a remover.
 *
 * São coisas diferentes e a diferença importa:
 *
 *  - **Retirar acesso** é o caso normal. A pessoa deixa de entrar, o histórico
 *    fica. As despesas dela continuam a contar para o saldo de quem partilha o
 *    ambiente, porque apagá-las desequilibrava contas alheias que já podem ter
 *    sido acertadas.
 *  - **Apagar dados** é para pedidos de RGPD. Leva a conta e os ambientes onde
 *    a pessoa estava sozinha. Ambientes partilhados ficam de pé.
 *
 * O segundo pede confirmação escrita de propósito: não tem volta.
 *
 * As duas **dizem o que aconteceu**. Antes engoliam os erros e a página
 * recarregava igual, o que fazia uma remoção falhada parecer uma remoção feita.
 */
export function AccountRow({ account }: { account: AppUser }) {
  const [confirming, setConfirming] = useState(false);
  const [removeState, removeAction] = useFormState(removeAccountAccessAction, empty);
  const [deleteState, deleteAction] = useFormState(deleteAccountDataAction, empty);
  const state = deleteState.error || deleteState.ok ? deleteState : removeState;

  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{account.name}</p>
          <p className="mt-0.5 font-mono text-[11px] text-fg-faint">{account.email}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form action={removeAction}>
            <input type="hidden" name="userId" value={account.id} />
            <SubmitButton label="Retirar acesso" pendingLabel="A retirar…" />
          </form>

          {confirming ? (
            <form action={deleteAction} className="flex items-center gap-2">
              <input type="hidden" name="userId" value={account.id} />
              <label className="sr-only" htmlFor={`conf-${account.id}`}>
                Escreve apagar para confirmar
              </label>
              <input
                id={`conf-${account.id}`}
                name="confirmar"
                placeholder='escreve "apagar"'
                className="input h-9 w-36 py-1 text-xs"
                autoComplete="off"
              />
              <SubmitButton label="Confirmar" pendingLabel="A apagar…" danger />
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="btn-ghost px-2 text-xs"
              >
                Cancelar
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="btn-ghost px-2.5 text-xs text-debt hover:text-debt"
            >
              Apagar dados
            </button>
          )}
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-debt">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="mt-2 text-xs text-credit">{state.message}</p> : null}
    </li>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  danger,
}: {
  label: string;
  pendingLabel: string;
  danger?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`btn-ghost px-2 text-xs ${danger ? "text-debt hover:text-debt" : ""}`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
