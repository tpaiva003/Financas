"use client";

import { useFormState, useFormStatus } from "react-dom";
import { acceptMemberInviteAction, type ConviteState } from "@/app/convite/actions";

const empty: ConviteState = {};

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action] = useFormState(acceptMemberInviteAction, empty);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="ci-pass">Escolhe a tua palavra-chave</label>
        <input
          id="ci-pass"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          placeholder="••••••••"
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor="ci-confirm">Outra vez, para confirmar</label>
        <input
          id="ci-confirm"
          name="confirm"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          placeholder="••••••••"
          className="input"
        />
      </div>
      {state.error ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          {state.error}
        </p>
      ) : null}
      <Button />
    </form>
  );
}

function Button() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "A criar a conta…" : "Aceitar e criar a conta"}
    </button>
  );
}
