import { requireUser } from "@/lib/session";
import { getRepository } from "@/lib/data";
import { getHouseholdBalance } from "@/lib/services/balance-service";
import { householdUsers, userById } from "@/lib/users";
import { formatCents } from "@/lib/domain";
import { SettlementForm } from "@/components/SettlementForm";

export const metadata = { title: "Acertos — Finanças" };
export const dynamic = "force-dynamic";

export default async function AcertosPage() {
  const user = await requireUser();
  const [settlements, { statement }] = await Promise.all([
    getRepository().listSettlements(),
    getHouseholdBalance(user.id),
  ]);
  const users = householdUsers();
  const today = new Date().toISOString().slice(0, 10);

  // Pré-preenche o acerto sugerido: o devedor paga ao credor o valor em dívida.
  const suggested = statement.settled
    ? null
    : {
        fromUserId: statement.debtorId ?? users[0]!.id,
        toUserId: statement.creditorId ?? users[1]!.id,
        amount: (statement.amountCents / 100).toFixed(2),
      };

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-slate-900">Acertos</h1>

      <div className="card p-4">
        {statement.settled ? (
          <p className="text-sm text-slate-600">Está tudo acertado — nada a pagar. 🎉</p>
        ) : (
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">
              {userById(statement.debtorId ?? "")?.name}
            </span>{" "}
            deve {formatCents(statement.amountCents)} a{" "}
            <span className="font-medium text-slate-900">
              {userById(statement.creditorId ?? "")?.name}
            </span>
            .
          </p>
        )}
      </div>

      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Registar acerto</h2>
        <SettlementForm
          users={users.map((u) => ({ id: u.id, name: u.name }))}
          today={today}
          suggested={suggested}
        />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Histórico de acertos
        </h2>
        {settlements.length === 0 ? (
          <p className="card p-6 text-center text-sm text-slate-500">Sem acertos registados.</p>
        ) : (
          <ul className="space-y-2">
            {settlements.map((s) => (
              <li key={s.id} className="card flex items-center gap-3 p-3">
                <span aria-hidden className="text-lg">
                  🤝
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">
                    {userById(s.fromUserId)?.name} → {userById(s.toUserId)?.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(s.date).toLocaleDateString("pt-PT")}
                    {s.note ? ` · ${s.note}` : ""}
                  </p>
                </div>
                <div className="shrink-0 font-semibold text-slate-900">
                  {formatCents(s.amountCents, s.currency)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
