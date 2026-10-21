"use client";

/**
 * As datas que se aproximam, na carteira.
 *
 * **Só aparece quando há alguma.** Um painel permanente com "próximos
 * resultados" de tudo o que se tem seria lido durante uma semana e ignorado
 * para sempre — e no dia em que uma data interessasse, já estava invisível.
 * Quando não há nada perto, isto não desenha nada.
 *
 * A data-ex vem destacada das outras porque é a única com prazo a sério: quem
 * quiser o dividendo tem de ter as ações antes desse dia, e passou, perdeu-se.
 * Nas outras duas não há nada a fazer — há só a saber.
 */

import { useFormState, useFormStatus } from "react-dom";
import {
  DATA_LABEL,
  DATA_PORQUE,
  quandoPorExtenso,
  type DataAProximar,
} from "@/lib/domain";
import { atualizarDatasAction, type ActionState } from "@/app/(app)/actions";

const vazio: ActionState = {};

function Botao({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-secondary text-xs" disabled={pending}>
      {pending ? "A perguntar…" : label}
    </button>
  );
}

export function DatasAProximar({
  datas,
  porConsultar,
}: {
  datas: DataAProximar[];
  /** Quantos investimentos em carteira nunca foram consultados. */
  porConsultar: number;
}) {
  const [state, atualizar] = useFormState(atualizarDatasAction, vazio);

  // Nada perto e nada por perguntar: o painel não existe.
  if (datas.length === 0 && porConsultar === 0 && !state.message && !state.error) return null;

  if (datas.length === 0) {
    return (
      <div className="rounded-xl border border-hair bg-panel2/40 p-4">
        <p className="text-xs leading-snug text-fg-muted">
          {porConsultar > 0 ? (
            <>
              Ainda não fui ver as datas de resultados e dividendos de{" "}
              {porConsultar === 1 ? "um investimento" : `${porConsultar} investimentos`}.
            </>
          ) : (
            <>Não há resultados nem dividendos à porta nas próximas duas semanas.</>
          )}
        </p>
        <form action={atualizar} className="mt-2 flex flex-wrap items-center gap-2">
          <Botao label="Ver as datas" />
          {state.error ? (
            <span role="alert" className="text-[11px] leading-snug text-debt">
              {state.error}
            </span>
          ) : state.ok ? (
            <span className="text-[11px] text-fg-faint">{state.message}</span>
          ) : null}
        </form>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-hair bg-panel2/40 p-4">
      <p className="text-sm font-medium text-fg">A caminho</p>
      <p className="mt-1 text-xs leading-snug text-fg-faint">
        Datas das empresas que tens em carteira. Só as próximas: um aviso que
        aparece sempre deixa de ser um aviso.
      </p>

      <ul className="mt-3 space-y-2">
        {datas.map((d) => (
          <li key={`${d.assetId}-${d.tipo}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
                d.tipo === "ex-dividendo"
                  ? "border-warn/50 text-warn"
                  : "border-hair text-fg-muted"
              }`}
            >
              {DATA_LABEL[d.tipo]}
            </span>
            <span className="min-w-0 text-sm text-fg">{d.nome}</span>
            <span className="text-xs text-fg-muted">
              {quandoPorExtenso(d.emDias)}
              <span className="text-fg-faint">
                {" "}
                ({new Date(`${d.data}T00:00:00Z`).toLocaleDateString("pt-PT")})
              </span>
            </span>
            <span className="basis-full text-[11px] leading-snug text-fg-faint">
              {DATA_PORQUE[d.tipo]}
            </span>
          </li>
        ))}
      </ul>

      <form action={atualizar} className="mt-3 flex flex-wrap items-center gap-2">
        <Botao label="Atualizar datas" />
        {state.error ? (
          <span role="alert" className="text-[11px] leading-snug text-debt">
            {state.error}
          </span>
        ) : state.ok ? (
          <span className="text-[11px] text-fg-faint">{state.message}</span>
        ) : porConsultar > 0 ? (
          <span className="text-[11px] text-fg-faint">
            {porConsultar === 1 ? "Falta um investimento" : `Faltam ${porConsultar} investimentos`} por
            consultar.
          </span>
        ) : null}
      </form>
    </section>
  );
}
