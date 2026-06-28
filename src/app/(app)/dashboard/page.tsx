import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getHouseholdBalance } from "@/lib/services/balance-service";
import { getRepository } from "@/lib/data";
import { householdUsers, userById } from "@/lib/users";
import { formatCents } from "@/lib/domain";
import { ExpenseRow } from "@/components/ExpenseRow";

export const metadata = { title: "Saldo — Finanças" };
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
    <div className="space-y-6">
      <BalanceHero statement={statement} />

      {pending.length > 0 ? (
        <div className="card border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">
            {pending.length} despesa(s) recorrente(s) por confirmar
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Valores variáveis (luz, água, gás) precisam de confirmação antes de
            entrarem no saldo.
          </p>
          <Link href="/despesas?status=pending" className="mt-2 inline-block text-sm font-medium text-amber-900 underline">
            Ver pendentes →
          </Link>
        </div>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Despesas recentes
          </h2>
          <Link href="/despesas" className="text-sm font-medium text-brand-700">
            Ver todas
          </Link>
        </div>
        {confirmed.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-2">
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
      <div className="card bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white">
        <p className="text-sm text-brand-100">Saldo atual</p>
        <p className="mt-1 text-2xl font-semibold">Está tudo acertado 🎉</p>
        <p className="mt-1 text-sm text-brand-100">Ninguém deve nada a ninguém.</p>
      </div>
    );
  }
  const debtor = userById(statement.debtorId ?? "")?.name ?? statement.debtorId;
  const creditor = userById(statement.creditorId ?? "")?.name ?? statement.creditorId;
  return (
    <Link href="/saldo" className="block">
      <div className="card bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white transition hover:from-brand-700 hover:to-brand-900">
        <p className="text-sm text-brand-100">Saldo atual</p>
        <p className="mt-1 text-3xl font-semibold">{formatCents(statement.amountCents)}</p>
        <p className="mt-1 text-sm text-brand-100">
          <span className="font-medium text-white">{debtor}</span> deve a{" "}
          <span className="font-medium text-white">{creditor}</span>
        </p>
        <p className="mt-3 text-xs text-brand-200 underline">Ver como é composto →</p>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center gap-2 p-8 text-center">
      <span className="text-3xl" aria-hidden>
        🧾
      </span>
      <p className="text-sm text-slate-600">Ainda não há despesas.</p>
      <Link href="/despesas/nova" className="btn-primary mt-1">
        Adicionar a primeira
      </Link>
    </div>
  );
}
