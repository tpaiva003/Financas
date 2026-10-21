"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { addMemberAction, type ActionState } from "@/app/(app)/actions";

const initial: ActionState = {};

/**
 * O ambiente não vai no formulário.
 *
 * Ia num campo escondido, e um campo escondido é só um campo que o servidor
 * acreditava. O ambiente é agora decidido no servidor, a partir da sessão.
 */
export function AddMemberForm() {
  const [state, action] = useFormState(addMemberAction, initial);
  const ref = useRef<HTMLFormElement>(null);
  const [grant, setGrant] = useState(false);
  const [desde, setDesde] = useState(false);

  // Limpa o formulário só depois de adicionar com sucesso.
  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setGrant(false);
      setDesde(false);
    }
  }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-3">
      {state.error ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          {state.error}
        </p>
      ) : null}
      {state.ok && state.message ? (
        <p className="break-all rounded-xl border border-credit/30 bg-credit/10 px-4 py-3 text-sm text-credit">
          {state.message}
        </p>
      ) : null}
      <div>
        <label className="label" htmlFor="m-name">Nome</label>
        <input id="m-name" name="name" type="text" required placeholder="Ex.: Mãe" className="input" />
      </div>

      {!grant ? (
        <div>
          <label className="label" htmlFor="m-email">Email (opcional)</label>
          <input id="m-email" name="email" type="email" placeholder="opcional" className="input" />
        </div>
      ) : null}

      {/*
        O que fazer ao histórico. Sem esta escolha, acrescentar alguém redividia
        as despesas todas que já lá estavam: a pessoa ficava a dever a sua parte
        de jantares em que não esteve, e o saldo de quem cá estava virava-se do
        avesso sem ninguém ter mexido em nada.
      */}
      <fieldset className="rounded-xl border border-hair bg-panel2/40 p-3">
        <legend className="label px-1">Divide despesas…</legend>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="radio"
            name="participa"
            value="agora"
            defaultChecked
            onChange={() => setDesde(false)}
            className="h-4 w-4 border-hair bg-panel2 accent-fg"
          />
          <span>De agora em diante</span>
        </label>

        <label className="mt-2 flex items-center gap-3 text-sm">
          <input
            type="radio"
            name="participa"
            value="tudo"
            onChange={() => setDesde(false)}
            className="h-4 w-4 border-hair bg-panel2 accent-fg"
          />
          <span>Tudo, incluindo o que já cá está</span>
        </label>

        <label className="mt-2 flex items-center gap-3 text-sm">
          <input
            type="radio"
            name="participa"
            value="desde"
            onChange={() => setDesde(true)}
            className="h-4 w-4 border-hair bg-panel2 accent-fg"
          />
          <span>A partir de uma data</span>
        </label>

        {desde ? (
          <div className="mt-2 pl-7">
            <label className="sr-only" htmlFor="m-desde">Data a partir da qual divide</label>
            <input id="m-desde" name="participaDesde" type="date" required className="input" />
          </div>
        ) : null}

        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.04em] text-fg-faint">
          Só afeta divisões em partes iguais · o que já foi acertado não muda
        </p>
      </fieldset>

      <label className="flex items-center gap-3 text-sm text-fg-muted">
        <input
          type="checkbox"
          name="grantSubmit"
          checked={grant}
          onChange={(e) => setGrant(e.target.checked)}
          className="h-4 w-4 rounded border-hair bg-panel2 accent-fg"
        />
        Dar acesso para <span className="text-fg">submeter despesas</span> (com aprovação)
      </label>

      {grant ? (
        <div className="rounded-xl border border-hair bg-panel2/40 p-3">
          <label className="label" htmlFor="m-access-email">Email de acesso</label>
          <input
            id="m-access-email"
            name="accessEmail"
            type="email"
            required
            placeholder="email@exemplo.pt"
            className="input"
          />
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.04em] text-fg-faint">
            Recebe um convite por email e escolhe a palavra-chave ao aceitar ·
            só submete despesas (pagador e divisão entre os membros plenos)
          </p>
        </div>
      ) : null}

      <SubmitButton grant={grant} />
    </form>
  );
}

function SubmitButton({ grant }: { grant: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending
        ? "A adicionar…"
        : grant
          ? "Adicionar com acesso de submissão"
          : "Adicionar participante"}
    </button>
  );
}
