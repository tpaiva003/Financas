"use client";

/**
 * Registar um desdobramento à mão.
 *
 * **Porque é que o botão de confirmar não chega.** A deteção precisa das duas
 * pernas — a venda e a compra do mesmo dia. Nem todas as corretoras exportam as
 * duas: há ficheiros que trazem só a venda, e nesse caso as unidades vão todas
 * embora, a posição fica a zero e o investimento passa a aparecer como fechado.
 * Foi assim que a Google e a NVIDIA desapareceram de uma carteira que continuava
 * a tê-las — e sem esta caixa não havia como as trazer de volta.
 *
 * Fica dobrado: é raro, e um formulário aberto por cima da ficha faz parecer
 * que há alguma coisa por preencher.
 */

import { useFormState, useFormStatus } from "react-dom";
import { confirmarSplitAction, type ActionState } from "@/app/(app)/actions";

const vazio: ActionState = {};

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-secondary text-xs" disabled={pending}>
      {pending ? "A registar…" : "Registar desdobramento"}
    </button>
  );
}

export function SplitManual({ assetId }: { assetId: string }) {
  const [state, registar] = useFormState(confirmarSplitAction, vazio);

  return (
    <details className="card p-5">
      <summary className="cursor-pointer text-sm text-fg-muted transition-colors hover:text-fg">
        Registar um desdobramento à mão
      </summary>

      <p className="mt-3 text-xs leading-snug text-fg-faint">
        Serve para quando a corretora não exportou as duas pernas da operação:
        acontece, e o sinal é a posição aparecer a zero ou com menos unidades do
        que devia. As unidades compradas <strong className="font-medium text-fg">antes</strong> da
        data passam a contar multiplicadas pelo fator. O dinheiro investido não
        muda.
      </p>

      <form action={registar} className="mt-3 space-y-3">
        <input type="hidden" name="assetId" value={assetId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`sp-data-${assetId}`}>Data do desdobramento</label>
            <input
              id={`sp-data-${assetId}`}
              name="date"
              type="date"
              required
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor={`sp-ratio-${assetId}`}>Fator</label>
            <input
              id={`sp-ratio-${assetId}`}
              name="ratio"
              inputMode="decimal"
              placeholder="20"
              className="input"
            />
            <p className="mt-1 text-xs text-fg-faint">
              Num 20:1 escreve-se <span className="font-mono text-fg-muted">20</span>. Num
              agrupamento 1:10, <span className="font-mono text-fg-muted">0,1</span>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Guardar />
          {state.error ? (
            <span role="alert" className="text-xs text-debt">{state.error}</span>
          ) : null}
          {state.ok ? <span className="text-xs text-credit">{state.message}</span> : null}
        </div>
      </form>

      <p className="mt-3 text-xs leading-snug text-fg-faint">
        Se a corretora exportou uma venda de todas as unidades nesse dia, apaga-a
        depois de registares isto: essa venda não aconteceu, e enquanto lá
        estiver continua a fabricar uma mais-valia que nunca existiu.
      </p>
    </details>
  );
}
