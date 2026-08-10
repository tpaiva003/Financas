import Link from "next/link";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { TICKET_STATUS_LABELS, ticketAberto, type TicketStatus } from "@/lib/domain";
import { AtualizaSozinho } from "@/components/AtualizaSozinho";
import { NovoPedido } from "@/components/NovoPedido";

export const metadata = { title: "Ajuda · Rachar" };
export const dynamic = "force-dynamic";

/**
 * Os pedidos de ajuda de quem está a ver.
 *
 * **Só os dele.** Nem os dos outros participantes do mesmo ambiente: um pedido
 * leva lá dentro o que a pessoa quiser escrever, incluindo coisas que ela não
 * diria à frente de quem divide as despesas com ela. A verificação vai na
 * consulta, não num `if` depois de ler.
 */
export default async function AjudaPage() {
  const ctx = await getSpaceContext();
  const pedidos = await getRepository().listTicketsDoUtilizador(ctx.user.id).catch(() => null);

  const abertos = (pedidos ?? []).filter((p) => ticketAberto(p.status));
  const arrumados = (pedidos ?? []).filter((p) => !ticketAberto(p.status));

  return (
    <div className="space-y-8">
      {/* O estado muda do outro lado, e quem está à espera não tem de
          recarregar para o saber. */}
      <AtualizaSozinho segundos={30} />

      <div>
        <p className="eyebrow">Ajuda</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          Fala connosco
        </h1>
        <p className="mt-1 max-w-prose text-sm text-fg-muted">
          Alguma coisa não bate certo, falta-te uma funcionalidade, ou um número
          parece errado? Escreve. Vês aqui o estado e a resposta, sem teres de
          ir ao email.
        </p>
      </div>

      <NovoPedido />

      {pedidos === null ? (
        <p role="alert" className="card p-6 text-sm text-fg-muted">
          Não consegui ler os teus pedidos. Falta correr a migração dos pedidos
          de ajuda. Não é que não tenhas nenhum — é que ainda não sei.
        </p>
      ) : pedidos.length === 0 ? (
        <p className="card p-8 text-center text-sm text-fg-muted">
          Ainda não abriste nenhum pedido.
        </p>
      ) : (
        <>
          <Lista titulo="Em aberto" pedidos={abertos} vazio="Nenhum pedido em aberto." />
          {arrumados.length > 0 ? (
            <Lista titulo="Arrumados" pedidos={arrumados} vazio="" />
          ) : null}
        </>
      )}
    </div>
  );
}

function Lista({
  titulo,
  pedidos,
  vazio,
}: {
  titulo: string;
  pedidos: { id: string; subject: string; status: TicketStatus; updatedAt: string }[];
  vazio: string;
}) {
  if (pedidos.length === 0 && !vazio) return null;
  return (
    <section>
      <h2 className="eyebrow mb-3">{titulo}</h2>
      {pedidos.length === 0 ? (
        <p className="card p-6 text-center text-sm text-fg-muted">{vazio}</p>
      ) : (
        <ul className="card divide-y divide-hair2 p-0">
          {pedidos.map((p) => (
            <li key={p.id}>
              <Link
                href={`/ajuda/${p.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-panel2/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{p.subject}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-fg-faint">
                    {new Date(p.updatedAt).toLocaleDateString("pt-PT")}
                  </span>
                </span>
                <EstadoChip status={p.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

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
