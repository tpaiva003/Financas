import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isAdmin, householdUsers } from "@/lib/users";
import { getRepository } from "@/lib/data";
import type { SpaceSummary } from "@/lib/data";
import { InviteUserForm } from "@/components/InviteUserForm";

export const metadata = { title: "Plataforma · Rachar" };
export const dynamic = "force-dynamic";

/**
 * Consola do dono da plataforma.
 *
 * Mostra a saúde do serviço — quantas contas, quantos ambientes, onde há
 * movimento — e NÃO mostra o conteúdo de ninguém: nem descrições, nem valores,
 * nem saldos. É de propósito. Gerir a plataforma não é o mesmo que ler as
 * contas de quem a usa, e a app não deve tornar a segunda coisa fácil só
 * porque a primeira é legítima.
 */
export default async function PlataformaPage() {
  const user = await requireUser();
  if (!isAdmin(user.id)) redirect("/dashboard");

  const stats = await getRepository()
    .getPlatformStats()
    .catch(() => null);

  if (!stats) {
    return (
      <p className="card p-10 text-center text-sm text-fg-muted">
        Não consegui ler os números da plataforma.
      </p>
    );
  }

  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Gestão</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Plataforma</h1>
        <p className="mt-1 text-sm text-fg-muted">
          A saúde do serviço num relance. Cada ambiente pertence a quem lá está —
          aqui só se veem contagens e datas, nunca despesas, valores ou saldos.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* As contas base (allow-list) não vivem na tabela de contas: somam-se. */}
        <Stat label="Contas" value={stats.accountCount + householdUsers().length} />
        <Stat label="Ambientes" value={stats.spaceCount} />
        <Stat label="Despesas" value={stats.expenseCount} />
        <Stat label="Ativos (30 dias)" value={stats.activeSpaces} />
      </div>

      <section className="card p-6">
        <h2 className="label">Dar acesso a alguém</h2>
        <p className="mb-3 text-sm text-fg-muted">
          Cria uma conta independente com ambiente próprio. A pessoa entra com o
          email indicado e define a palavra-chave na primeira entrada.
        </p>
        <InviteUserForm />
      </section>

      <section>
        <h2 className="eyebrow mb-3">Ambientes</h2>
        {stats.spaces.length === 0 ? (
          <p className="card p-8 text-center text-sm text-fg-muted">Ainda não há ambientes.</p>
        ) : (
          <ul className="card divide-y divide-hair2 p-0">
            {stats.spaces.map((s) => (
              <SpaceRow key={s.id} space={s} cutoff={cutoff} />
            ))}
          </ul>
        )}
      </section>

      {stats.templates.length > 0 ? (
        <section>
          <h2 className="eyebrow mb-3">Bancos aprendidos</h2>
          <p className="mb-3 text-sm text-fg-muted">
            Formatos que alguém ensinou à app. Cada um serve toda a gente daí em
            diante — é assim que a plataforma vai crescendo com os inputs.
          </p>
          <ul className="card divide-y divide-hair2 p-0">
            {stats.templates.map((t) => (
              <li key={t.label} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="truncate text-sm text-fg">{t.label}</span>
                <span className="shrink-0 font-mono text-xs tnum text-fg-faint">
                  {t.uses} {t.uses === 1 ? "utilização" : "utilizações"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Link href="/dashboard" className="inline-block text-sm text-fg-muted hover:text-fg">
        ← Voltar
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-1.5 font-display text-3xl font-semibold tracking-tight tnum">{value}</p>
    </div>
  );
}

function SpaceRow({ space, cutoff }: { space: SpaceSummary; cutoff: string }) {
  const active = space.lastActivity !== null && space.lastActivity >= cutoff;
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("pt-PT") : "sem movimento";

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate text-sm font-medium text-fg">
          {space.name}
          {active ? <span className="chip border-credit/30 text-credit">ativo</span> : null}
        </p>
        <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
          criado a {fmt(space.createdAt)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-4 font-mono text-xs tnum text-fg-muted">
        <span title="Participantes">{space.memberCount} 👤</span>
        <span title="Despesas registadas">{space.expenseCount} desp.</span>
        <span title="Data da despesa mais recente" className="text-fg-faint">
          {fmt(space.lastActivity)}
        </span>
      </div>
    </li>
  );
}
