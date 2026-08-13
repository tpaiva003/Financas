"use client";

/**
 * Do estudo para o património, sem reescrever tudo.
 *
 * **Não compra nada.** Cria o investimento com o símbolo, o nome e o preço que
 * estavam no estudo, e com **zero unidades** — a posição nasce dos movimentos,
 * como nasce em toda a app. Pré-preencher uma quantidade seria a app a decidir
 * quanto é que alguém investiu.
 *
 * A ligação ao estudo não fica gravada: um DCF é uma folha de rascunho com
 * data de validade, e amarrá-lo a um bem faria com que um valor de hoje
 * continuasse a aparecer ao lado da posição daqui a três anos.
 */

import { useFormState, useFormStatus } from "react-dom";
import { saveAssetAction, type ActionState } from "@/app/(app)/actions";

const vazio: ActionState = {};

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary text-sm" disabled={pending}>
      {pending ? "A criar…" : "Criar no património"}
    </button>
  );
}

export function PreencherAtivoDoDcf({
  nome,
  simbolo,
  precoCents,
}: {
  nome: string;
  simbolo: string;
  precoCents: number | null;
}) {
  const [state, criar] = useFormState(saveAssetAction, vazio);

  if (!nome.trim()) {
    return (
      <p className="text-xs text-fg-faint">
        Escreve o nome da empresa lá em cima para poderes criá-la no património.
      </p>
    );
  }

  if (state.ok) {
    return (
      <p className="rounded-xl border border-credit/30 bg-credit/10 px-4 py-3 text-sm text-fg-muted">
        {state.message} Regista lá a compra quando a fizeres — a posição nasce
        dos movimentos.
      </p>
    );
  }

  return (
    <form action={criar} className="card space-y-2 p-5">
      <input type="hidden" name="name" value={nome} />
      <input type="hidden" name="kind" value="investimento" />
      <input type="hidden" name="symbol" value={simbolo} />
      {precoCents !== null ? (
        <input type="hidden" name="unitPrice" value={(precoCents / 100).toFixed(2)} />
      ) : null}

      <p className="text-sm text-fg">Decidiste investir?</p>
      <p className="text-xs leading-snug text-fg-faint">
        Cria <span className="text-fg-muted">{nome}</span> no património com o
        símbolo e o preço deste estudo, e sem unidades nenhumas. A quantidade sai
        dos movimentos que registares — a app não decide quanto investiste.
      </p>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Botao />
        {state.error ? (
          <span role="alert" className="text-xs text-debt">{state.error}</span>
        ) : null}
      </div>
    </form>
  );
}
