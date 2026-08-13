"use client";

/**
 * Um desdobramento que a app reconheceu e que espera confirmação.
 *
 * **Porque é que espera.** A assinatura — uma venda e uma compra no mesmo dia,
 * pelo mesmo dinheiro, com quantidades diferentes — é forte, mas serve também a
 * uma venda e uma recompra a sério feitas ao cêntimo. Aplicá-la sozinha apagava
 * uma mais-valia realizada que alguém tem de declarar no IRS. Aqui mostra-se o
 * que se percebeu, o que vai acontecer, e pede-se um clique.
 *
 * **Diz o que vai mudar antes de mudar.** "Confirmar" sem dizer que as duas
 * linhas vão desaparecer seria uma armadilha: quem carrega vê a lista encolher
 * e não sabe porquê.
 */

import { useFormState, useFormStatus } from "react-dom";
import { confirmarSplitAction, type ActionState } from "@/app/(app)/actions";
import { ratioPorExtenso, type SplitSugerido as Sugerido } from "@/lib/domain";

const vazio: ActionState = {};

function Confirmar({ ratio }: { ratio: number }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary text-xs" disabled={pending}>
      {pending ? "A registar…" : `Confirmar ${ratioPorExtenso(ratio)}`}
    </button>
  );
}

export function SplitSugerido({
  assetId,
  sugerido: s,
}: {
  assetId: string;
  sugerido: Sugerido;
}) {
  const [state, confirmar] = useFormState(confirmarSplitAction, vazio);
  if (state.ok) {
    return (
      <p className="rounded-xl border border-credit/30 bg-credit/10 px-4 py-3 text-sm text-fg-muted">
        {state.message}
      </p>
    );
  }

  const data = new Date(`${s.date}T00:00:00Z`).toLocaleDateString("pt-PT");

  return (
    <form
      action={confirmar}
      className="space-y-2 rounded-xl border border-hair bg-panel2/40 px-4 py-3"
    >
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="date" value={s.date} />
      <input type="hidden" name="ratio" value={String(s.ratio)} />
      <input type="hidden" name="vendaId" value={s.vendaId} />
      <input type="hidden" name="compraId" value={s.compraId} />

      <p className="text-sm font-medium text-fg">
        Isto parece um desdobramento de {ratioPorExtenso(s.ratio)} em {data}.
      </p>
      <p className="text-xs leading-snug text-fg-muted">
        Nesse dia há uma venda de {s.unidadesAntes} unidades e uma compra de{" "}
        {s.unidadesDepois}, <strong className="font-medium text-fg">pelo mesmo dinheiro</strong>. Não
        saiu nem entrou nada da conta — é a forma como a corretora regista um
        desdobramento.
      </p>
      <p className="text-xs leading-snug text-fg-faint">
        Ao confirmar, as duas linhas desaparecem e fica registado o desdobramento.
        As unidades compradas antes desse dia passam a contar multiplicadas por{" "}
        {String(Math.round(s.ratio * 100) / 100).replace(".", ",")}, e o custo por
        unidade desce na mesma proporção. O dinheiro investido não muda.
      </p>
      <p className="text-xs leading-snug text-fg-faint">
        Se foi mesmo uma venda seguida de uma recompra, não confirmes — havia
        uma mais-valia real nesse dia.
      </p>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Confirmar ratio={s.ratio} />
        {state.error ? (
          <span role="alert" className="text-xs text-debt">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
