import Link from "next/link";
import { notFound } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { TICKET_STATUS_LABELS, TICKET_STATUS_NOTES } from "@/lib/domain";
import { AtualizaSozinho } from "@/components/AtualizaSozinho";
import { PedidoResposta } from "@/components/PedidoResposta";
import { EstadoChip } from "@/app/(app)/ajuda/page";

export const metadata = { title: "Pedido · Rachar" };
export const dynamic = "force-dynamic";

/**
 * Um pedido de ajuda, do lado de quem o abriu.
 *
 * **Este ecrã nunca chama a leitura que traz as notas internas.** Não há aqui
 * nenhum filtro a decidir o que se mostra: a função que serve esta página não
 * as devolve de todo. Um filtro é uma linha que alguém pode apagar ao arrumar o
 * ficheiro; uma função que não sabe ler a coluna, não.
 */
export default async function PedidoPage({ params }: { params: { id: string } }) {
  const ctx = await getSpaceContext();
  const repo = getRepository();

  // Pelo id **e** pelo autor, numa consulta só.
  const pedido = await repo.getTicketDoUtilizador(params.id, ctx.user.id).catch(() => null);
  if (!pedido) notFound();

  const mensagens = await repo.listTicketMessagesPublicas(pedido.id).catch(() => []);
  const quando = (iso: string) =>
    new Date(iso).toLocaleString("pt-PT", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-6">
      <AtualizaSozinho segundos={20} />

      <div>
        <Link href="/ajuda" className="eyebrow hover:text-fg">
          ← Pedidos
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{pedido.subject}</h1>
          <EstadoChip status={pedido.status} />
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          {TICKET_STATUS_NOTES[pedido.status]} Aberto a{" "}
          {new Date(pedido.createdAt).toLocaleDateString("pt-PT")}.
        </p>
      </div>

      <ul className="space-y-3">
        {mensagens.map((m) => {
          const meu = m.authorId === ctx.user.id;
          return (
            <li
              key={m.id}
              className={`card p-4 ${meu ? "" : "border-fg/15 bg-panel2/40"}`}
            >
              <p className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
                <span className={meu ? "text-fg-muted" : "text-fg"}>
                  {meu ? "Tu" : "Rachar"}
                </span>
                <span>{quando(m.createdAt)}</span>
              </p>
              {/* `whitespace-pre-wrap` para os parágrafos de quem escreveu se
                  manterem. Não há HTML aqui: é texto e é desenhado como texto. */}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{m.body}</p>
            </li>
          );
        })}
      </ul>

      {pedido.status === "fechado" ? (
        <p className="card p-5 text-sm text-fg-muted">
          Este pedido foi encerrado. Se o assunto voltou, abre um novo — assim
          fica com a história limpa em vez de continuar um fio antigo.
        </p>
      ) : (
        <PedidoResposta ticketId={pedido.id} estado={pedido.status} />
      )}

      <p className="text-xs text-fg-faint">
        Estado atual: {TICKET_STATUS_LABELS[pedido.status].toLowerCase()}. Esta
        página atualiza-se sozinha enquanto a tiveres à frente.
      </p>
    </div>
  );
}
