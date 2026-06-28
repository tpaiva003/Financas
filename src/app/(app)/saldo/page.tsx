import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getHouseholdBalance } from "@/lib/services/balance-service";
import { userById } from "@/lib/users";
import { formatCents } from "@/lib/domain";

export const metadata = { title: "Saldo explicado — Finanças" };
export const dynamic = "force-dynamic";

export default async function SaldoPage() {
  const user = await requireUser();
  const { balance, statement, userAId } = await getHouseholdBalance(user.id);

  const contributions = [...balance.contributions].sort((a, b) => (a.date < b.date ? 1 : -1));
  const userAName = userById(userAId)?.name ?? userAId;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard" className="eyebrow transition-colors hover:text-fg">
          ← Saldo
        </Link>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
          Como é composto
        </h1>
      </div>

      <div className="card p-6">
        {statement.settled ? (
          <p className="font-display text-2xl font-semibold">Tudo acertado ✦</p>
        ) : (
          <p className="font-display text-2xl font-semibold tracking-tight">
            {userById(statement.debtorId ?? "")?.name} deve{" "}
            <span className="tnum">{formatCents(statement.amountCents)}</span> a{" "}
            {userById(statement.creditorId ?? "")?.name}
          </p>
        )}
        <p className="mt-2 text-sm text-fg-muted">
          Reconciliado até cada despesa e acerto. A coluna mostra o impacto no
          crédito de {userAName}.
        </p>
      </div>

      <ul>
        {contributions.map((c) => {
          const delta = c.deltas[userAId] ?? 0;
          const positive = delta >= 0;
          return (
            <li key={`${c.source}-${c.id}`} className="row">
              <span className="chip shrink-0">
                {c.source === "settlement" ? "Acerto" : "Despesa"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-fg">{c.description}</p>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
                  {new Date(c.date).toLocaleDateString("pt-PT")} · {formatCents(c.amountCents)}
                </p>
              </div>
              <div
                className={`shrink-0 font-mono text-sm tnum ${
                  positive ? "text-credit" : "text-debt"
                }`}
              >
                {positive ? "+" : ""}
                {formatCents(delta)}
              </div>
            </li>
          );
        })}
      </ul>

      {contributions.length === 0 ? (
        <p className="card p-8 text-center text-sm text-fg-muted">
          Ainda não há despesas partilhadas nem acertos.
        </p>
      ) : null}
    </div>
  );
}
