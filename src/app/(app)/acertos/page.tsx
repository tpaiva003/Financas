import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { getSpaceBalance } from "@/lib/services/balance-service";
import { formatCents } from "@/lib/domain";
import { SettlementForm } from "@/components/SettlementForm";
import { ClosePeriodPanel } from "@/components/ClosePeriodPanel";
import { TransferBalanceForm } from "@/components/TransferBalanceForm";

export const metadata = { title: "Acertos · Finanças" };
export const dynamic = "force-dynamic";

export default async function AcertosPage() {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");
  const [settlements, { transfers }, sharedExpenses] = await Promise.all([
    getRepository().listSettlements(ctx.space.id),
    getSpaceBalance(ctx.space.id, ctx.fullMembers, ctx.viewerMemberId),
    getRepository().listExpenses({
      spaceId: ctx.space.id,
      viewerId: ctx.viewerMemberId,
      kind: "shared",
    }),
  ]);
  const nameOf = (id: string) => ctx.members.find((m) => m.id === id)?.name ?? id;
  const today = new Date().toISOString().slice(0, 10);

  const openCount = sharedExpenses.filter((e) => !e.settledAt && e.status === "confirmed").length;
  const settledCount = sharedExpenses.filter((e) => e.settledAt).length;
  const transfersTotal = transfers.reduce((acc, t) => acc + t.amountCents, 0);

  const otherSpaces = ctx.spaces.filter((s) => s.id !== ctx.space.id);
  const canTransfer = ctx.fullMembers.length === 2 && transfers.length > 0 && otherSpaces.length > 0;

  const first = transfers[0];
  const suggested = first
    ? {
        fromUserId: first.fromUserId,
        toUserId: first.toUserId,
        amount: (first.amountCents / 100).toFixed(2),
      }
    : null;

  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">{ctx.space.name}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Acertos</h1>
      </div>

      <div className="card p-5">
        {transfers.length === 0 ? (
          <p className="text-sm text-fg-muted">Está tudo acertado, nada a pagar. ✦</p>
        ) : (
          <ul className="space-y-1.5">
            {transfers.map((t, i) => (
              <li key={i} className="text-[15px] text-fg-muted">
                <span className="font-medium text-fg">{nameOf(t.fromUserId)}</span> paga{" "}
                <span className="font-mono tnum text-fg">{formatCents(t.amountCents)}</span> a{" "}
                <span className="font-medium text-fg">{nameOf(t.toUserId)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ClosePeriodPanel
        hasBalance={transfers.length > 0}
        balanceLabel={formatCents(transfersTotal)}
        openCount={openCount}
        settledCount={settledCount}
      />

      {canTransfer ? (
        <div className="card p-6">
          <h2 className="label">Transferir saldo para outro ambiente</h2>
          <TransferBalanceForm
            spaces={otherSpaces.map((s) => ({ id: s.id, name: s.name }))}
            balanceLabel={formatCents(transfersTotal)}
          />
        </div>
      ) : null}

      <div className="card p-6">
        <h2 className="label">Registar acerto manual</h2>
        <SettlementForm
          members={ctx.fullMembers.map((m) => ({ id: m.id, name: m.name }))}
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
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-hair bg-panel2/50">↪</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-fg">
                    {nameOf(s.fromUserId)} → {nameOf(s.toUserId)}
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
