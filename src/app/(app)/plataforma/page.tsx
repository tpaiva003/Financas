import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isAdmin, householdUsers } from "@/lib/users";
import { getRepository } from "@/lib/data";
import type { SpaceSummary } from "@/lib/data";
import { InviteUserForm } from "@/components/InviteUserForm";
import { AccountRow } from "@/components/AccountRow";
import { QuoteDiagnostic } from "@/components/QuoteDiagnostic";

export const metadata = { title: "Plataforma · Rachar" };
export const dynamic = "force-dynamic";

/**
 * Consola do dono da plataforma.
 *
 * Mostra a saúde do serviço, quantas contas, quantos ambientes, onde há
 * movimento, e NÃO mostra o conteúdo de ninguém: nem descrições, nem valores,
 * nem saldos. É de propósito. Gerir a plataforma não é o mesmo que ler as
 * contas de quem a usa, e a app não deve tornar a segunda coisa fácil só
 * porque a primeira é legítima.
 */
export default async function PlataformaPage() {
  const user = await requireUser();
  if (!isAdmin(user.id)) redirect("/dashboard");

  // Se falhar por inteiro, dizemos porquê. É um ecrã só do admin: esconder o
  // motivo só torna o problema mais difícil de resolver.
  let stats;
  let failure: string | null = null;
  try {
    stats = await getRepository().getPlatformStats();
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }

  if (!stats) {
    return (
      <div className="card space-y-2 p-8 text-center">
        <p className="text-sm text-fg">Não consegui ler os números da plataforma.</p>
        {failure ? <p className="font-mono text-xs text-fg-faint">{failure}</p> : null}
        <p className="text-sm text-fg-muted">
          Se for passageiro, recarregar resolve. O resto da app não é afetado.
        </p>
      </div>
    );
  }

  const accounts = await getRepository()
    .listAppUsers()
    .catch(() => []);
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Gestão</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Plataforma</h1>
        <p className="mt-1 text-sm text-fg-muted">
          A saúde do serviço num relance. Cada ambiente pertence a quem lá está,
          aqui só se veem contagens e datas, nunca despesas, valores ou saldos.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* As contas base (allow-list) não vivem na tabela de contas: somam-se. */}
        <Stat
          label="Contas"
          value={stats.accountCount === null ? null : stats.accountCount + householdUsers().length}
        />
        <Stat label="Ambientes" value={stats.spaceCount} />
        <Stat label="Despesas" value={stats.expenseCount} />
        <Stat label="Ativos (30 dias)" value={stats.activeSpaces} />
      </div>

      {/* O que não foi possível ler. O resto da consola continua a servir. */}
      {stats.warnings.length > 0 ? (
        <div
          role="status"
          className="rounded-xl border border-hair bg-panel2/40 p-4 text-sm text-fg-muted"
        >
          <p className="font-medium text-fg">Alguns números não vieram desta vez.</p>
          <ul className="mt-1 space-y-0.5 font-mono text-xs text-fg-faint">
            {stats.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            Costuma ser passageiro, recarrega a página. O que está em cima continua certo.
          </p>
        </div>
      ) : null}

      <section className="card p-6">
        <h2 className="label">Dar acesso a alguém</h2>
        <p className="mb-3 text-sm text-fg-muted">
          Cria uma conta independente com ambiente próprio. A pessoa entra com o
          email indicado e define a palavra-chave na primeira entrada.
        </p>
        <InviteUserForm />
      </section>

      <section>
        <h2 className="eyebrow mb-3">Contas com acesso</h2>
        {accounts.length === 0 ? (
          <p className="card p-8 text-center text-sm text-fg-muted">
            Ainda não convidaste ninguém.
          </p>
        ) : (
          <ul className="card divide-y divide-hair2 p-0">
            {accounts.map((a) => (
              <AccountRow key={a.id} account={a} />
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-fg-faint">
          As contas base (as tuas e da Clara) vêm das variáveis de ambiente e não
          se removem aqui.
        </p>
      </section>

      {stats.features.length > 0 ? (
        <section>
          <h2 className="eyebrow mb-1">O que é usado</h2>
          <p className="mb-3 text-sm text-fg-muted">
            Em quantos ambientes cada parte da app é usada. Sem isto só se via a
            despesa, e uma funcionalidade que ninguém usa é uma funcionalidade a
            manter por nada.
          </p>
          <ul className="card divide-y divide-hair2 p-0">
            {[...stats.features]
              .sort((a, b) => b.spaces - a.spaces || b.records - a.records)
              .map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="truncate text-sm text-fg">{f.label}</span>
                  <span className="shrink-0 font-mono text-xs tnum text-fg-faint">
                    {f.spaces === 0 ? (
                      <span className="text-fg-faint">ninguém</span>
                    ) : (
                      <>
                        {f.spaces} {f.spaces === 1 ? "ambiente" : "ambientes"} ·{" "}
                        {f.records} {f.records === 1 ? "registo" : "registos"}
                      </>
                    )}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

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
            diante, é assim que a plataforma vai crescendo com os inputs.
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

      <QuoteDiagnostic />

      <Link href="/dashboard" className="inline-block text-sm text-fg-muted hover:text-fg">
        ← Voltar
      </Link>
    </div>
  );
}

/** Nomes curtos para as etiquetas de cada ambiente. */
const FEATURE_LABELS: Record<string, string> = {
  patrimonio: "património",
  investimentos: "investimentos",
  rendimentos: "rendimentos",
  recorrentes: "recorrentes",
  importacoes: "importações",
  metas: "metas",
};

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{label}</p>
      <p
        className={`mt-1.5 font-display text-3xl font-semibold tracking-tight tnum ${
          value === null ? "text-fg-faint" : ""
        }`}
        title={value === null ? "Não foi possível ler este número" : undefined}
      >
        {value === null ? "—" : value}
      </p>
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

      {/* Que partes da app este ambiente usa. Só os nomes, nunca o conteúdo. */}
      {space.features.length > 0 ? (
        <div className="flex w-full flex-wrap gap-1.5">
          {space.features.map((f) => (
            <span key={f} className="chip border-hair text-fg-faint">
              {FEATURE_LABELS[f] ?? f}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}
