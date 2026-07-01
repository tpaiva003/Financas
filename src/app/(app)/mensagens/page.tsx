import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/users";
import { getRepository } from "@/lib/data";
import type { ContactMessage } from "@/lib/data";
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
  searchParams: { arquivadas?: string };
}) {
  const user = await requireUser();
  if (!isAdmin(user.id)) redirect("/dashboard");

  const showArchived = searchParams.arquivadas === "1";
  const all = await getRepository().listContactMessages();
  const active = all.filter((m) => !m.archivedAt);
  const archived = all.filter((m) => m.archivedAt);
  const unread = active.filter((m) => !m.readAt).length;
  const list = showArchived ? archived : active;

  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">Da landing pública</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          Mensagens {unread > 0 ? <span className="text-fg-muted">· {unread} por ler</span> : null}
        </h1>
      </div>

      <div className="flex items-center gap-1 rounded-full border border-hair p-1 text-sm">
        <Tab href="/mensagens" active={!showArchived} label={`Ativas (${active.length})`} />
        <Tab href="/mensagens?arquivadas=1" active={showArchived} label={`Arquivadas (${archived.length})`} />
      </div>

      {list.length === 0 ? (
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

      {/* Notas internas — o que foi feito sobre esta mensagem. */}
      <form action={setMessageNotesAction} className="mt-4 border-t border-hair pt-4">
        <input type="hidden" name="id" value={m.id} />
        <label htmlFor={`notes-${m.id}`} className="label">Nota interna</label>
        <textarea
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
      </div>
    </li>
  );
}
