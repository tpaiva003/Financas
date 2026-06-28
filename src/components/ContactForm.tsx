"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitContactAction, type ContactState } from "@/app/landing-actions";

const initial: ContactState = {};

export function ContactForm() {
  const [state, action] = useFormState(submitContactAction, initial);

  if (state.ok) {
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-2xl font-semibold">Recebido. Obrigado!</p>
        <p className="mt-2 text-sm text-fg-muted">
          Vamos ler com atenção e responder ao teu email assim que pudermos.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-4 p-6 sm:p-8">
      {state.error ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          {state.error}
        </p>
      ) : null}

      {/* honeypot (escondido) */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="c-name">Nome (opcional)</label>
          <input id="c-name" name="name" type="text" className="input" placeholder="O teu nome" />
        </div>
        <div>
          <label className="label" htmlFor="c-email">Email</label>
          <input id="c-email" name="email" type="email" required className="input" placeholder="tu@exemplo.pt" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="c-message">Mensagem</label>
        <textarea
          id="c-message"
          name="message"
          required
          rows={4}
          className="input resize-none"
          placeholder="O que gostavas de gerir melhor nas vossas contas?"
        />
      </div>

      <label className="flex items-start gap-3 text-sm text-fg-muted">
        <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 rounded border-hair bg-panel2 accent-fg" />
        <span>
          Aceito que guardem o meu contacto para me responderem. Não recebo spam e
          posso pedir para apagar quando quiser.
        </span>
      </label>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? "A enviar…" : "Quero saber mais"}
    </button>
  );
}
