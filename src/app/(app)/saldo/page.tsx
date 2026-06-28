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

  const contributions = [...balance.contributions].sort((a, b) =>
    a.date < b.date ? 1 : -1,
  );
  const userAName = userById(userAId)?.name ?? userAId;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/dashboard" className="text-slate-400 hover:text-slate-600" aria-label="Voltar">
          ←
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">Como é composto o saldo</h1>
      </div>

      <div className="card p-5">
        {statement.settled ? (
          <p className="text-lg font-semibold text-slate-900">Está tudo acertado 🎉</p>
        ) : (
          <p className="text-lg font-semibold text-slate-900">
            {userById(statement.debtorId ?? "")?.name} deve{" "}
            {formatCents(statement.amountCents)} a {userById(statement.creditorId ?? "")?.name}
          </p>
        )}
        <p className="mt-1 text-sm text-slate-500">
          O saldo abaixo está reconciliado até cada despesa e acerto que o compõe.
          Valores na coluna referem o impacto no crédito de {userAName}.
        </p>
      </div>

      <ul className="space-y-2">
        {contributions.map((c) => {
          const delta = c.deltas[userAId] ?? 0;
          const positive = delta >= 0;
          return (
            <li key={`${c.source}-${c.id}`} className="card flex items-center gap-3 p-3">
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase"
                style={{
                  background: c.source === "settlement" ? "#ecfdf5" : "#eff6ff",
                  color: c.source === "settlement" ? "#047857" : "#1d4ed8",
                }}
              >
                {c.source === "settlement" ? "Acerto" : "Despesa"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">{c.description}</p>
                <p className="text-xs text-slate-500">
                  {new Date(c.date).toLocaleDateString("pt-PT")} · valor{" "}
                  {formatCents(c.amountCents)}
                </p>
              </div>
              <div
                className={`shrink-0 text-right text-sm font-semibold ${
                  positive ? "text-green-600" : "text-red-600"
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
        <p className="card p-6 text-center text-sm text-slate-500">
          Ainda não há despesas partilhadas nem acertos.
        </p>
      ) : null}
    </div>
  );
}
