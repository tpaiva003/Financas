"use client";

import { useFormState, useFormStatus } from "react-dom";
import { requestPasswordResetAction, type ResetState } from "@/app/recuperar/actions";

const empty: ResetState = {};

export function RequestResetForm() {
  const [state, action] = useFormState(requestPasswordResetAction, empty);

  if (state.ok) {
    return (
      <p className="rounded-xl border border-credit/30 bg-credit/10 px-4 py-3 text-sm text-credit">
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label" htmlFor="rec-email">Email</label>
        <input
          id="rec-email"
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder="tu@exemplo.pt"
          className="input"
        />
      </div>
      <Button />
    </form>
  );
}

function Button() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "A enviar…" : "Enviar ligação"}
    </button>
  );
}
