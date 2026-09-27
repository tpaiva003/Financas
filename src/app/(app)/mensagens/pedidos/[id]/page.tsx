import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/users";
import { getRepository } from "@/lib/data";
import { TICKET_STATUS_LABELS } from "@/lib/domain";
import { AtualizaSozinho } from "@/components/AtualizaSozinho";
import { PedidoResposta } from "@/components/PedidoResposta";

export const metadata = { title: "Pedido · Rachar" };
export const dynamic = "force-dynamic";

/**
 * Um pedido de ajuda, do lado de quem responde.
 *
 * É o único ecrã que lê `listTicketMessagesTodas`, e por isso o único onde as
 * notas internas aparecem. Elas são desenhadas de forma **visivelmente**
 * diferente: um fio onde as duas camadas se parecem é um fio onde mais cedo ou
 * mais tarde alguém copia a nota interna para a resposta.
 */
export default async function PedidoAdminPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!isAdmin(user.id)) redirect("/dashboard");

  const repo = getRepository();
  const pedido = await repo.getTicket(params.id).catch(() => null);
  if (!pedido) notFound();

  const mensagens = await repo.listTicketMessagesTodas(pedido.id).catch(() => []);
  const espaco = await repo.getSpace(pedido.spaceId).catch(() => null);
  const quando = (iso: string) =>
    new Date(iso).toLocaleString("pt-PT", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-6">
      <AtualizaSozinho segundos={30} />

      <div>
        <Link href="/mensagens?pedidos=1" className="eyebrow hover:text-fg">
          ← Pedidos
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">
          {pedido.subject}
        </h1>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
          {TICKET_STATUS_LABELS[pedido.status]} · {espaco?.name ?? pedido.spaceId} ·{" "}
          {pedido.createdBy} · aberto a{" "}
          {new Date(pedido.createdAt).toLocaleDateString("pt-PT")}
        </p>
      </div>

      <ul className="space-y-3">
        {mensagens.map((m) => {
          const daEquipa = m.authorId === user.id;
          if (m.internal) {
            return (
              <li key={m.id} className="rounded-xl border border-warn/40 bg-warn/10 p-4">
                <p className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.04em] text-warn">
                  <span>Nota interna</span>
                  <span className="text-fg-faint">{quando(m.createdAt)}</span>
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{m.body}</p>
                <p className="mt-2 text-[11px] text-fg-faint">
                  Não é visível para quem abriu o pedido.
                </p>
              </li>
            );
          }
          return (
            <li key={m.id} className={`card p-4 ${daEquipa ? "border-fg/15 bg-panel2/40" : ""}`}>
              <p className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
                <span className={daEquipa ? "text-fg" : "text-fg-muted"}>
                  {daEquipa ? "Tu" : "Utilizador"}
                </span>
                <span>{quando(m.createdAt)}</span>
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{m.body}</p>
            </li>
          );
        })}
      </ul>

      <PedidoResposta ticketId={pedido.id} admin estado={pedido.status} />
    </div>
  );
}
