"use client";

/**
 * Abrir um pedido de ajuda.
 *
 * Dobrado por omissão: quem chega a esta página quase sempre vem ver o que
 * responderam a um pedido que já abriu, e um formulário aberto por cima da
 * lista empurra para baixo exactamente o que a pessoa veio ler. Abre-se num
 * clique — e fica aberto sozinho quando ainda não há pedido nenhum, porque aí
 * não há mais nada para ver.
 */

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { abrirPedidoAction, type ActionState } from "@/app/(app)/actions";
import { TICKET_ASSUNTO_MAX, TICKET_CORPO_MAX } from "@/lib/domain";

const vazio: ActionState = {};

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary text-sm" disabled={pending}>
      {pending ? "A enviar…" : "Enviar pedido"}
    </button>
  );
}

export function NovoPedido() {
  const [state, abrir] = useFormState(abrirPedidoAction, vazio);
  const [aberto, setAberto] = useState(false);

  if (!aberto && !state.ok) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="btn-primary text-sm">
        Escrever um pedido
      </button>
    );
  }

  return (
    <form
      action={abrir}
      // Depois de enviar, o formulário volta a ficar vazio para o próximo. A
      // confirmação fica por cima, senão parecia que não tinha ido.
      key={state.ok ? "enviado" : "a-escrever"}
      className="card space-y-3 p-5"
    >
      {state.ok ? (
        <p className="rounded-xl border border-credit/30 bg-credit/10 px-3 py-2 text-sm text-fg-muted">
          {state.message}
        </p>
      ) : null}

      <div>
        <label className="label" htmlFor="pedido-assunto">Assunto</label>
        <input
          id="pedido-assunto"
          name="assunto"
          maxLength={TICKET_ASSUNTO_MAX}
          placeholder="Em duas palavras, do que se trata"
          className="input"
        />
      </div>

      <div>
        <label className="label" htmlFor="pedido-corpo">O que se passa</label>
        <textarea
          id="pedido-corpo"
          name="corpo"
          rows={5}
          maxLength={TICKET_CORPO_MAX}
          placeholder="Quanto mais concreto, mais depressa se resolve: o que fizeste, o que esperavas, e o que aconteceu."
          className="input min-h-[7rem] resize-y"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Enviar />
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="btn-ghost px-2 text-xs"
        >
          Fechar
        </button>
        {state.error ? (
          <span role="alert" className="text-xs text-debt">{state.error}</span>
        ) : null}
      </div>
    </form>
  );
}
