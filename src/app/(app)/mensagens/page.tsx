import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/users";
import { getRepository } from "@/lib/data";
import { markMessageReadAction } from "@/app/(app)/actions";

export const metadata = { title: "Mensagens · Finanças" };
export const dynamic = "force-dynamic";

export default async function MensagensPage() {
  const user = await requireUser();
  if (!isAdmin(user.id)) redirect("/dashboard");

  const messages = await getRepository().listContactMessages();
  const unread = messages.filter((m) => !m.readAt).length;

  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">Da landing pública</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          Mensagens {unread > 0 ? <span className="text-fg-muted">· {unread} por ler</span> : null}
        </h1>
      </div>

      {messages.length === 0 ? (
        <p className="card p-10 text-center text-sm text-fg-muted">
          Ainda não há mensagens de contacto.
        </p>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <li key={m.id} className={`card p-5 ${m.readAt ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-fg">
                    {m.name || "Sem nome"}
                    {!m.readAt ? <span className="ml-2 chip border-credit/30 text-credit">Nova</span> : null}
                  </p>
                  <a href={`mailto:${m.email}`} className="font-mono text-[12px] text-fg-muted underline-offset-4 hover:underline">
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
              {!m.readAt ? (
                <form action={markMessageReadAction} className="mt-4">
                  <input type="hidden" name="id" value={m.id} />
                  <button type="submit" className="btn-ghost text-xs">Marcar como lida</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
