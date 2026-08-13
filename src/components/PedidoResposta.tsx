"use client";

/**
 * A caixa de responder a um pedido.
 *
 * A mesma para os dois lados, com uma diferença que não é de estilo: só quem é
 * administrador vê o botão de **nota interna** e o seletor de estado. E o que
 * decide não é este componente — é o servidor, que recusa uma nota interna a
 * quem não é administrador. Aqui só se decide o que se desenha; um `admin`
 * forjado no cliente não passaria disso.
 *
 * **A nota interna é visualmente diferente enquanto se escreve.** Escrever uma
 * coisa que não pode ser lida por quem perguntou, numa caixa igual à das
 * respostas, é um acidente à espera de acontecer. Com o botão ligado, a caixa
 * muda de cor e diz por palavras quem vai ler.
 */

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { responderPedidoAction, type ActionState } from "@/app/(app)/actions";
import { TICKET_STATUSES, TICKET_STATUS_LABELS, type TicketStatus } from "@/lib/domain";

const vazio: ActionState = {};

function Enviar({ interna }: { interna: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary text-sm" disabled={pending}>
      {pending ? "A enviar…" : interna ? "Guardar nota interna" : "Responder"}
    </button>
  );
}

export function PedidoResposta({
  ticketId,
  admin = false,
  estado,
}: {
  ticketId: string;
  admin?: boolean;
  estado: TicketStatus;
}) {
  const [state, responder] = useFormState(responderPedidoAction, vazio);
  const [interna, setInterna] = useState(false);

  return (
    <form action={responder} className="card space-y-3 p-5">
      <input type="hidden" name="ticketId" value={ticketId} />
      {admin ? <input type="hidden" name="interna" value={interna ? "1" : "0"} /> : null}

      <div>
        <label className="label" htmlFor={`resposta-${ticketId}`}>
          {interna ? "Nota interna" : "A tua resposta"}
        </label>
        <textarea
          id={`resposta-${ticketId}`}
          name="corpo"
          rows={4}
          maxLength={4000}
          placeholder={
            interna
              ? "Fica só para ti. Quem abriu o pedido não vê isto."
              : "Escreve aqui."
          }
          className={`input min-h-[6rem] resize-y ${
            interna ? "border-warn/50 bg-warn/5" : ""
          }`}
        />
      </div>

      {admin ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setInterna((v) => !v)}
            aria-pressed={interna}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              interna
                ? "border-warn bg-warn/15 text-warn"
                : "border-hair text-fg-muted hover:border-fg/30 hover:text-fg"
            }`}
          >
            {interna ? "É nota interna" : "Marcar como nota interna"}
          </button>

          <div className="flex items-center gap-2">
            <label className="text-xs text-fg-muted" htmlFor={`estado-${ticketId}`}>
              Estado
            </label>
            <select
              id={`estado-${ticketId}`}
              name="estado"
              defaultValue={estado}
              className="select h-9 w-auto text-sm"
            >
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TICKET_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {interna ? (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs leading-snug text-fg-muted">
          Isto <strong className="font-medium text-fg">não</strong> vai para quem abriu o
          pedido. Não muda o estado nem a hora da última resposta que ele vê.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Enviar interna={interna} />
        {state.error ? (
          <span role="alert" className="text-xs text-debt">
            {state.error}
          </span>
        ) : null}
        {state.ok ? <span className="text-xs text-credit">{state.message}</span> : null}
      </div>
    </form>
  );
}
