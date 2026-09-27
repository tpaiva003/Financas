/**
 * Uma secção da consola, que abre e fecha.
 *
 * **Porque é que a consola precisa disto.** A página tinha oito blocos empilhados
 * e crescia a cada sessão: para chegar aos ambientes passava-se por cima dos
 * números, das contas, do que é usado e dos bancos aprendidos. Numa consola de
 * administração o que se procura é quase sempre **uma** coisa, e percorrer as
 * outras sete de cada vez é o custo de as ter todas na mesma página.
 *
 * **`<details>` e não estado no cliente.** Abre sem JavaScript, o browser
 * lembra-se do foco, a pesquisa da página encontra texto lá dentro, e não há
 * nada para hidratar numa página que já é servida por inteiro.
 *
 * **Cada secção diz o que tem antes de se abrir.** Um acordeão em que todos os
 * cabeçalhos se parecem obriga a abrir todos para encontrar um — que é
 * exactamente o problema que ele veio resolver. O `resumo` é o que substitui
 * essa abertura.
 */

import type { ReactNode } from "react";

export function PlataformaSeccao({
  titulo,
  resumo,
  nota,
  aberta,
  children,
}: {
  titulo: string;
  /** Uma linha com o número que se procuraria lá dentro. */
  resumo?: string;
  /** O que esta secção responde, para quem não souber. */
  nota?: string;
  /** Aberta de origem. Só a primeira: um acordeão todo aberto não é um acordeão. */
  aberta?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={aberta} className="card group p-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-fg">{titulo}</span>
          {nota ? (
            <span className="mt-0.5 block text-xs leading-snug text-fg-faint">{nota}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {resumo ? (
            <span className="font-mono text-[11px] tnum text-fg-muted">{resumo}</span>
          ) : null}
          <span
            aria-hidden="true"
            className="inline-block text-fg-faint transition-transform group-open:rotate-90"
          >
            ›
          </span>
        </span>
      </summary>
      <div className="border-t border-hair2 px-5 py-4">{children}</div>
    </details>
  );
}
