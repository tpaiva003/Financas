"use client";

import { useFormState, useFormStatus } from "react-dom";
import { completePasswordResetAction, type ResetState } from "@/app/recuperar/actions";

const empty: ResetState = {};

export function NewPasswordForm({ token }: { token: string }) {
  const [state, action] = useFormState(completePasswordResetAction, empty);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="np-pass">Palavra-chave nova</label>
        <input
          id="np-pass"
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
        <label className="label" htmlFor="np-confirm">Outra vez, para confirmar</label>
        <input
          id="np-confirm"
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
      {pending ? "A guardar…" : "Guardar palavra-chave"}
    </button>
  );
}
