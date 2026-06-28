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

  const suggested = statement.settled
    ? null
    : {
        fromUserId: statement.debtorId ?? users[0]!.id,
        toUserId: statement.creditorId ?? users[1]!.id,
        amount: (statement.amountCents / 100).toFixed(2),
      };

  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">Pagamentos entre vocês</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Acertos</h1>
      </div>

      <div className="card p-5">
        {statement.settled ? (
          <p className="text-sm text-fg-muted">Está tudo acertado — nada a pagar. ✦</p>
        ) : (
          <p className="text-[15px] text-fg-muted">
            <span className="font-medium text-fg">{userById(statement.debtorId ?? "")?.name}</span>{" "}
            deve <span className="tnum font-mono text-fg">{formatCents(statement.amountCents)}</span> a{" "}
            <span className="font-medium text-fg">{userById(statement.creditorId ?? "")?.name}</span>.
          </p>
        )}
      </div>

      <div className="card p-6">
        <h2 className="label">Registar acerto</h2>
        <SettlementForm
          users={users.map((u) => ({ id: u.id, name: u.name }))}
          today={today}
          suggested={suggested}
        />
      </div>

      <section>
        <h2 className="eyebrow mb-2">Histórico</h2>
        {settlements.length === 0 ? (
          <p className="card p-8 text-center text-sm text-fg-muted">Sem acertos registados.</p>
        ) : (
          <ul>
            {settlements.map((s) => (
              <li key={s.id} className="row">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-hair bg-panel2/50">
                  ↪
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-fg">
                    {userById(s.fromUserId)?.name} → {userById(s.toUserId)?.name}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
                    {new Date(s.date).toLocaleDateString("pt-PT")}
                    {s.note ? ` · ${s.note}` : ""}
                  </p>
                </div>
                <div className="shrink-0 font-mono text-[15px] tnum text-fg">
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
