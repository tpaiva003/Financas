"use client";

import { useFormState, useFormStatus } from "react-dom";
import { probeQuotesAction, type ProbeState } from "@/app/(app)/plataforma/probe-actions";

const empty: ProbeState = {};

const CORES: Record<string, string> = {
  ok: "text-credit",
  "simbolo-desconhecido": "text-debt",
  "sem-rede": "text-debt",
  "resposta-estranha": "text-debt",
};

/**
 * Saber se as cotações funcionam, e porquê quando não funcionam.
 *
 * "Não encontrei cotações para este símbolo" é honesto e inútil: pode ser o
 * símbolo errado, a fonte em baixo, ou o servidor sem saída para a internet.
 * São três problemas com três soluções, e sem os distinguir não se resolve
 * nenhum. Este botão distingue-os.
 */
export function QuoteDiagnostic() {
  const [state, action] = useFormState(probeQuotesAction, empty);

  return (
    <section className="card p-6">
      <h2 className="label">As cotações funcionam?</h2>
      <p className="mb-3 text-sm text-fg-muted">
        Testa a fonte com os índices de referência e com os símbolos que estão
        registados nos investimentos. Diz o que se passa, não só que falhou.
      </p>

      <form action={action}>
        <ProbeButton />
      </form>

      {state.error ? (
        <p role="alert" className="mt-3 text-sm text-debt">{state.error}</p>
      ) : null}

      {state.probes ? (
        <ul className="mt-4 space-y-3">
          {state.probes.map((p) => (
            <li key={p.symbol} className="border-t border-hair2 pt-3 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-sm text-fg">{p.symbol}</span>
                <span className="font-mono text-[11px] tnum text-fg-faint">
                  {p.httpStatus !== null ? `HTTP ${p.httpStatus} · ` : ""}
                  {p.ms} ms
                </span>
              </div>
              <p className={`mt-0.5 text-sm ${CORES[p.verdict] ?? "text-fg-muted"}`}>
                {p.message}
              </p>
              {p.firstLine ? (
                <p className="mt-1 truncate font-mono text-[11px] text-fg-faint">
                  {p.firstLine}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ProbeButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-secondary text-sm">
      {pending ? "A testar…" : "Testar a fonte de cotações"}
    </button>
  );
}
