import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/users";
import { getRepository } from "@/lib/data";
import type { ContactMessage } from "@/lib/data";
import { InviteUserForm } from "@/components/InviteUserForm";
import { AtualizaSozinho } from "@/components/AtualizaSozinho";
import { TICKET_STATUS_LABELS, ticketAberto } from "@/lib/domain";
import {
  markMessageReadAction,
  archiveMessageAction,
  setMessageNotesAction,
} from "@/app/(app)/actions";

export const metadata = { title: "Mensagens · Rachar" };
export const dynamic = "force-dynamic";

export default async function MensagensPage({
  searchParams,
}: {
  searchParams: { arquivadas?: string; pedidos?: string };
}) {
  const user = await requireUser();
  if (!isAdmin(user.id)) redirect("/dashboard");

  const showArchived = searchParams.arquivadas === "1";
  const showPedidos = searchParams.pedidos === "1";
  const all = await getRepository().listContactMessages();
  const active = all.filter((m) => !m.archivedAt);
  const archived = all.filter((m) => m.archivedAt);
  const unread = active.filter((m) => !m.readAt).length;
  const list = showArchived ? archived : active;

  /**
   * Os pedidos de ajuda dos utilizadores, ao lado das mensagens da landing.
   *
   * Ficam no mesmo sítio porque são a mesma coisa do ponto de vista de quem
   * atende: alguém escreveu e está à espera. A diferença é que um pedido é uma
   * conversa com estado, e uma mensagem da landing é um recado.
   *
   * Uma leitura falhada vira `null` e nunca lista vazia — a migração dos
   * pedidos pode não ter corrido, e "não há pedidos" seria mentira.
   */
  const pedidos = await getRepository().listTicketsTodos().catch(() => null);
  const pedidosAbertos = (pedidos ?? []).filter((p) => ticketAberto(p.status));

  return (
    <div className="space-y-7">
      {/* Chegam de outro lado enquanto esta página está aberta. */}
      <AtualizaSozinho segundos={45} />

      <div>
        <p className="eyebrow">Quem escreveu</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          Mensagens{" "}
          {unread + pedidosAbertos.length > 0 ? (
            <span className="text-fg-muted">
              · {unread + pedidosAbertos.length} por tratar
            </span>
          ) : null}
        </h1>
      </div>

      <section className="card p-6">
        <h2 className="label">Convidar para experimentar</h2>
        <p className="mb-3 text-sm text-fg-muted">
          Cria uma conta independente. A pessoa entra com o email indicado, define
          a palavra-chave na primeira entrada e recebe um ambiente só dela.
        </p>
        <InviteUserForm />
      </section>

      <div className="flex flex-wrap items-center gap-1 rounded-full border border-hair p-1 text-sm">
        <Tab
          href="/mensagens"
          active={!showArchived && !showPedidos}
          label={`Ativas (${active.length})`}
        />
        <Tab
          href="/mensagens?arquivadas=1"
          active={showArchived}
          label={`Arquivadas (${archived.length})`}
        />
        <Tab
          href="/mensagens?pedidos=1"
          active={showPedidos}
          label={
            pedidos === null
              ? "Pedidos (?)"
              : `Pedidos (${pedidosAbertos.length}${
                  pedidos.length > pedidosAbertos.length ? ` de ${pedidos.length}` : ""
                })`
          }
        />
      </div>

      {showPedidos ? (
        pedidos === null ? (
          <p role="alert" className="card p-6 text-sm text-fg-muted">
            Não consegui ler os pedidos. Falta correr a migração 0032. Não é que
            não haja nenhum — é que ainda não sei.
          </p>
        ) : pedidos.length === 0 ? (
          <p className="card p-10 text-center text-sm text-fg-muted">
            Ainda ninguém abriu um pedido de ajuda.
          </p>
        ) : (
          <ul className="card divide-y divide-hair2 p-0">
            {pedidos.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/mensagens/pedidos/${p.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-panel2/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">
                      {p.subject}
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px] text-fg-faint">
                      {p.createdBy} · {new Date(p.updatedAt).toLocaleDateString("pt-PT")}
                    </span>
                  </span>
                  <span
                    className={`chip shrink-0 ${
                      p.status === "novo"
                        ? "border-warn/50 text-warn"
                        : p.status === "resolvido"
                          ? "border-credit/40 text-credit"
                          : "border-hair text-fg-muted"
                    }`}
                  >
                    {TICKET_STATUS_LABELS[p.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : list.length === 0 ? (
        <p className="card p-10 text-center text-sm text-fg-muted">
          {showArchived ? "Não há mensagens arquivadas." : "Ainda não há mensagens de contacto."}
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((m) => (
            <MessageCard key={m.id} m={m} archivedView={showArchived} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Tab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3.5 py-1.5 transition-colors ${
        active ? "bg-panel2 text-fg" : "text-fg-muted hover:text-fg"
      }`}
    >
      {label}
    </Link>
  );
}

function MessageCard({ m, archivedView }: { m: ContactMessage; archivedView: boolean }) {
  return (
    <li className={`card p-5 ${archivedView ? "opacity-80" : m.readAt ? "opacity-90" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-fg">
            {m.name || "Sem nome"}
            {!m.readAt && !m.archivedAt ? (
              <span className="ml-2 chip border-credit/30 text-credit">Nova</span>
            ) : null}
          </p>
          <a
            href={`mailto:${m.email}`}
            className="font-mono text-[12px] text-fg-muted underline-offset-4 hover:underline"
          >
            {m.email}
          </a>
        </div>
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-faint">
          {new Date(m.createdAt).toLocaleDateString("pt-PT")}
        </span>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-fg-muted">
        {m.message}
      </p>

      {/* Notas internas, o que foi feito sobre esta mensagem. */}
      <form action={setMessageNotesAction} className="mt-4 border-t border-hair pt-4">
        <input type="hidden" name="id" value={m.id} />
        <label htmlFor={`notes-${m.id}`} className="label">Nota interna</label>
        {/*
          A `key` inclui a nota gravada de propósito. Este campo não é
          controlado, por isso o `defaultValue` só vale quando ele nasce: sem
          isto, ao recarregar a lista (arquivar, marcar como lida) o React
          reutilizava a caixa e o texto de uma mensagem aparecia noutra.
        */}
        <textarea
          key={`${m.id}:${m.notes ?? ""}`}
          id={`notes-${m.id}`}
          name="notes"
          rows={2}
          defaultValue={m.notes ?? ""}
          placeholder="O que foi feito / a fazer…"
          className="input min-h-[60px] resize-y"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-secondary text-xs">Guardar nota</button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!m.readAt && !m.archivedAt ? (
          <form action={markMessageReadAction}>
            <input type="hidden" name="id" value={m.id} />
            <button type="submit" className="btn-ghost text-xs">Marcar como lida</button>
          </form>
        ) : null}
        <form action={archiveMessageAction}>
          <input type="hidden" name="id" value={m.id} />
          <input type="hidden" name="archived" value={m.archivedAt ? "false" : "true"} />
          <button type="submit" className="btn-ghost text-xs">
            {m.archivedAt ? "Repor (desarquivar)" : "Arquivar"}
          </button>
        </form>
        <InviteUserForm compact defaultName={m.name ?? ""} defaultEmail={m.email ?? ""} />
      </div>
    </li>
  );
}
