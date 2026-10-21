"use client";

/**
 * Ir buscar o setor dos investimentos que ainda não o têm.
 *
 * **Trata um lote de cada vez e diz quantos ficaram.** Uma carteira com
 * cinquenta investimentos sem setor dava cinquenta idas à rede em série dentro
 * de uma função com tempo limitado — que estoirava o prazo e não gravava nada.
 * Assim cada carregar trata um lote, e o número no botão diz quantos faltam.
 *
 * **Um ETF sem setor na fonte não é uma falha.** A fonte não classifica fundos
 * por setor; chamar-lhe erro mandava alguém procurar um problema que não existe.
 * A mensagem separa os dois casos.
 */

import { useFormState, useFormStatus } from "react-dom";
import { descobrirSetoresAction, type ActionState } from "@/app/(app)/actions";

const vazio: ActionState = {};

function Botao({ porPerguntar }: { porPerguntar: number }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-ghost h-9 px-3 text-xs" disabled={pending}>
      {pending ? "A perguntar…" : `Ir buscar setores (${porPerguntar})`}
    </button>
  );
}

export function DescobrirSetores({ porPerguntar }: { porPerguntar: number }) {
  const [state, descobrir] = useFormState(descobrirSetoresAction, vazio);
  return (
    <form action={descobrir} className="flex flex-wrap items-center gap-2">
      <Botao porPerguntar={porPerguntar} />
      {state.ok ? <span className="text-xs text-fg-faint">{state.message}</span> : null}
      {state.error ? (
        <span role="alert" className="text-xs text-debt">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
