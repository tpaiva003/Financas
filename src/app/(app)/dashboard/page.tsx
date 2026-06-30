import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getSpaceBalance } from "@/lib/services/balance-service";
import { getRepository } from "@/lib/data";
import { generateDueRecurring } from "@/lib/services/recurring-service";
import { formatCents } from "@/lib/domain";
import { ExpenseRow } from "@/components/ExpenseRow";

export const metadata = { title: "Saldo · Finanças" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");
  const repo = getRepository();
  const nameOf = (id: string) => ctx.members.find((m) => m.id === id)?.name ?? id;

  // Gera ocorrências de recorrentes em atraso (idempotente, tolerante a falhas).
  await generateDueRecurring(ctx.space.id);

  const [{ transfers }, recent, categories] = await Promise.all([
    getSpaceBalance(ctx.space.id, ctx.fullMembers, ctx.viewerMemberId),
    repo.listExpenses({ spaceId: ctx.space.id, viewerId: ctx.viewerMemberId }),
    repo.listCategories(ctx.space.id),
  ]);

  const pending = recent.filter((e) => e.status === "pending");
  const pendingApprovals = recent.filter((e) => e.approvalStatus === "pending");
  const confirmed = recent.filter((e) => e.status === "confirmed").slice(0, 6);
  const categoryName = (id?: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "Sem categoria";

  const totalToSettle = transfers.reduce((s, t) => s + t.amountCents, 0);

  // Última atividade do próprio (REQ: ao entrar, ver as suas últimas datas).
  const fmtDate = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString("pt-PT") : "—";
  const myRegistered = [...recent]
    .filter((e) => e.createdBy === ctx.user.id)
    .sort((a, b) => ((a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1))[0];
  const myPaid = [...recent]
    .filter((e) => e.payerId === ctx.viewerMemberId && e.status === "confirmed")
    .sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : -1))[0];

  return (
    <div className="space-y-10">
      <BalanceHero
        transfers={transfers}
        totalToSettle={totalToSettle}
        nameOf={nameOf}
      />

      {pendingApprovals.length > 0 ? (
        <Link
          href="/aprovacoes"
          className="card flex items-center justify-between gap-4 border-debt/20 p-4 transition-colors hover:border-debt/40"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-debt/15 text-debt">✓</span>
            <div>
              <p className="text-sm font-medium">{pendingApprovals.length} despesa(s) por aprovar</p>
              <p className="text-xs text-fg-muted">Submetidas que aguardam a tua aprovação.</p>
            </div>
          </div>
          <span className="text-fg-faint">→</span>
        </Link>
      ) : null}

      {pending.length > 0 ? (
        <Link
          href="/recorrentes"
          className="card flex items-center justify-between gap-4 p-4 transition-colors hover:border-fg/20"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-debt/15 text-debt">!</span>
            <div>
              <p className="text-sm font-medium">{pending.length} recorrente(s) por confirmar</p>
              <p className="text-xs text-fg-muted">Valores variáveis (luz, água, gás).</p>
            </div>
          </div>
          <span className="text-fg-faint">→</span>
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="eyebrow">Última que registaste</p>
          <p className="mt-1 text-[15px] font-medium tnum text-fg">
            {myRegistered ? fmtDate(myRegistered.transactionDate) : "—"}
          </p>
          {myRegistered ? (
            <p className="mt-0.5 truncate text-xs text-fg-muted">{myRegistered.description}</p>
          ) : null}
        </div>
        <div className="card p-4">
          <p className="eyebrow">Última que pagaste</p>
          <p className="mt-1 text-[15px] font-medium tnum text-fg">
            {myPaid ? fmtDate(myPaid.transactionDate) : "—"}
          </p>
          {myPaid ? (
            <p className="mt-0.5 truncate text-xs text-fg-muted">{myPaid.description}</p>
          ) : null}
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="eyebrow">Despesas recentes</h2>
          <Link href="/despesas" className="text-xs text-fg-muted transition-colors hover:text-fg">
            Ver todas →
          </Link>
        </div>
        {confirmed.length === 0 ? (
          <EmptyState />
        ) : (
          <ul>
            {confirmed.map((e) => (
              <ExpenseRow
                key={e.id}
                expense={e}
                categoryName={categoryName(e.categoryId)}
                payerName={nameOf(e.payerId)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BalanceHero({
  transfers,
  totalToSettle,
  nameOf,
}: {
  transfers: { fromUserId: string; toUserId: string; amountCents: number }[];
  totalToSettle: number;
  nameOf: (id: string) => string;
}) {
  if (transfers.length === 0) {
    return (
      <section className="pt-4">
        <p className="eyebrow">Saldo atual</p>
        <p className="mt-3 font-display text-5xl font-semibold tracking-tightest sm:text-6xl">
          Tudo acertado
        </p>
        <p className="mt-3 text-sm text-fg-muted">Ninguém deve nada a ninguém. ✦</p>
      </section>
    );
  }

  // Caso simples (2 pessoas): uma só transferência.
  if (transfers.length === 1) {
    const t = transfers[0]!;
    return (
      <Link href="/saldo" className="block pt-4">
        <p className="eyebrow">Saldo atual</p>
        <p className="mt-3 font-display text-6xl font-semibold tracking-tightest tnum sm:text-7xl">
          {formatCents(t.amountCents)}
        </p>
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-fg-muted">
          <span className="font-medium text-fg">{nameOf(t.fromUserId)}</span>
          <span>deve a</span>
          <span className="font-medium text-fg">{nameOf(t.toUserId)}</span>
          <span className="ml-1 text-xs text-fg-faint underline-offset-4">· ver detalhe →</span>
        </p>
      </Link>
    );
  }

  // N pessoas: vários pagamentos sugeridos.
  return (
    <Link href="/saldo" className="block pt-4">
      <p className="eyebrow">Por acertar</p>
      <p className="mt-3 font-display text-6xl font-semibold tracking-tightest tnum sm:text-7xl">
        {formatCents(totalToSettle)}
      </p>
      <p className="mt-4 text-[15px] text-fg-muted">
        {transfers.length} pagamento(s) sugerido(s) para zerar o saldo.
        <span className="ml-1 text-xs text-fg-faint">· ver detalhe →</span>
      </p>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center gap-3 p-10 text-center">
      <p className="text-sm text-fg-muted">Ainda não há despesas neste ambiente.</p>
      <Link href="/despesas/nova" className="btn-primary">
        Adicionar a primeira
      </Link>
    </div>
  );
}
