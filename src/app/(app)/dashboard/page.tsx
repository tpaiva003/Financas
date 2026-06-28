import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getHouseholdBalance } from "@/lib/services/balance-service";
import { getRepository } from "@/lib/data";
import { userById } from "@/lib/users";
import { formatCents } from "@/lib/domain";
import { ExpenseRow } from "@/components/ExpenseRow";

export const metadata = { title: "Saldo · Finanças" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const repo = getRepository();

  const [{ statement }, recent, categories] = await Promise.all([
    getHouseholdBalance(user.id),
    repo.listExpenses({ viewerId: user.id }),
    repo.listCategories(),
  ]);

  const pending = recent.filter((e) => e.status === "pending");
  const confirmed = recent.filter((e) => e.status === "confirmed").slice(0, 6);
  const categoryName = (id?: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "Sem categoria";

  return (
    <div className="space-y-10">
      <BalanceHero statement={statement} />

      {pending.length > 0 ? (
        <Link
          href="/despesas?status=pending"
          className="card flex items-center justify-between gap-4 p-4 transition-colors hover:border-fg/20"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-debt/15 text-debt">!</span>
            <div>
              <p className="text-sm font-medium">
                {pending.length} recorrente(s) por confirmar
              </p>
              <p className="text-xs text-fg-muted">Valores variáveis (luz, água, gás).</p>
            </div>
          </div>
          <span className="text-fg-faint">→</span>
        </Link>
      ) : null}

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
                payerName={userById(e.payerId)?.name ?? e.payerId}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BalanceHero({
  statement,
}: {
  statement: Awaited<ReturnType<typeof getHouseholdBalance>>["statement"];
}) {
  if (statement.settled) {
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
  const debtor = userById(statement.debtorId ?? "")?.name ?? statement.debtorId;
  const creditor = userById(statement.creditorId ?? "")?.name ?? statement.creditorId;
  return (
    <Link href="/saldo" className="block pt-4">
      <p className="eyebrow">Saldo atual</p>
      <p className="mt-3 font-display text-6xl font-semibold tracking-tightest tnum sm:text-7xl">
        {formatCents(statement.amountCents)}
      </p>
      <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-fg-muted">
        <span className="font-medium text-fg">{debtor}</span>
        <span>deve a</span>
        <span className="font-medium text-fg">{creditor}</span>
        <span className="ml-1 inline-flex items-center gap-1 text-xs text-fg-faint underline-offset-4 group-hover:underline">
          · ver detalhe →
        </span>
      </p>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center gap-3 p-10 text-center">
      <p className="text-sm text-fg-muted">Ainda não há despesas.</p>
      <Link href="/despesas/nova" className="btn-primary">
        Adicionar a primeira
      </Link>
    </div>
  );
}
