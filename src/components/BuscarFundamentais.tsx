"use client";

/**
 * O botão que vai buscar as contas da empresa ao símbolo.
 *
 * **Preenche, não decide.** Todos os campos que isto escreve continuam
 * editáveis, e é de propósito: o fluxo de caixa livre dos últimos doze meses de
 * uma empresa cíclica é uma péssima base para dez anos de projeção, e quem está
 * a avaliar sabe disso melhor do que a app. O trabalho que se poupa é o de
 * copiar sete números de um relatório — não o de pensar neles.
 *
 * **Quando falha, diz porquê e não estraga o que já lá estava.** Um formulário
 * que se limpa sozinho porque a fonte não respondeu é pior do que um botão que
 * não faz nada: perde-se o que já se tinha escrito à mão.
 */

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { buscarFundamentaisAction, type FundamentaisState } from "@/app/(app)/actions";
import type { Fundamentais } from "@/lib/domain";

const inicial: FundamentaisState = {};

function Botao({ desativado }: { desativado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-secondary text-xs" disabled={pending || desativado}>
      {pending ? "A buscar…" : "Buscar dados financeiros"}
    </button>
  );
}

export function BuscarFundamentais({
  simbolo,
  aoReceber,
}: {
  simbolo: string;
  aoReceber: (dados: Fundamentais) => void;
}) {
  const [state, buscar] = useFormState(buscarFundamentaisAction, inicial);

  // O `useFormState` devolve o mesmo objeto até haver outra submissão, e sem
  // esta guarda o efeito voltava a escrever os campos a cada desenho — por cima
  // de qualquer correção feita à mão entretanto.
  const jaAplicado = useRef<Fundamentais | null>(null);
  const receber = useRef(aoReceber);
  receber.current = aoReceber;

  useEffect(() => {
    const d = state.dados;
    if (!d || jaAplicado.current === d) return;
    jaAplicado.current = d;
    receber.current(d);
  }, [state.dados]);

  const semSimbolo = !simbolo.trim();

  return (
    <div className="space-y-1.5">
      <form action={buscar} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="symbol" value={simbolo} />
        <Botao desativado={semSimbolo} />
        {semSimbolo ? (
          <span className="text-[11px] text-fg-faint">Escreve o símbolo para poder buscar.</span>
        ) : null}
      </form>

      {state.error ? (
        <p role="alert" className="text-xs leading-snug text-debt">
          {state.error} Os campos ficam para escrever à mão.
        </p>
      ) : null}

      {state.ok && state.message ? (
        <p className="text-xs leading-snug text-fg-faint">
          {state.message}
          {state.simbolo && state.simbolo !== simbolo.trim().toLowerCase() ? (
            <> Encontrei-a como <span className="font-mono text-fg-muted">{state.simbolo}</span>.</>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
