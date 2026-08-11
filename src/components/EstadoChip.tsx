/**
 * O estado de um pedido de ajuda, num chip.
 *
 * **Vive num ficheiro próprio e não na página que o desenha.** Uma página do
 * App Router só pode exportar o que o Next reconhece (`default`, `metadata`,
 * `dynamic`…) — qualquer outra exportação faz o `next build` falhar com
 * "not a valid Page export field". Estava exportado da página da ajuda e a
 * página do detalhe importava-o de lá: passava no `tsc`, passava no `lint`, e
 * só rebentava na compilação, quando essa página fosse revalidada.
 */

import { TICKET_STATUS_LABELS, type TicketStatus } from "@/lib/domain";

export function EstadoChip({ status }: { status: TicketStatus }) {
  const cor =
    status === "resolvido"
      ? "border-credit/40 text-credit"
      : status === "a-aguardar"
        ? "border-warn/50 text-warn"
        : status === "fechado"
          ? "border-hair text-fg-faint"
          : "border-hair text-fg-muted";
  return <span className={`chip shrink-0 ${cor}`}>{TICKET_STATUS_LABELS[status]}</span>;
}
