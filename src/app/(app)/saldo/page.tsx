import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getSpaceBalance } from "@/lib/services/balance-service";
import { formatCents } from "@/lib/domain";

export const metadata = { title: "Saldo explicado · Rachar" };
export const dynamic = "force-dynamic";

export default async function SaldoPage() {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");
  const { balance, transfers } = await getSpaceBalance(
    ctx.space.id,
    ctx.fullMembers,
    ctx.viewerMemberId,
  );
  const nameOf = (id: string) => ctx.members.find((m) => m.id === id)?.name ?? id;

  const contributions = [...balance.contributions].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard" className="eyebrow transition-colors hover:text-fg">
          ← Saldo
        </Link>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Como é composto</h1>
      </div>

      {/* Pagamentos sugeridos */}
      <div className="card p-6">
        {transfers.length === 0 ? (
          <p className="font-display text-2xl font-semibold">Tudo acertado ✦</p>
        ) : (
          <>
            <p className="eyebrow">Para acertar</p>
            <ul className="mt-3 space-y-2">
              {transfers.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-[15px]">
                  <span>
                    <span className="font-medium text-fg">{nameOf(t.fromUserId)}</span>
                    <span className="text-fg-muted"> paga a </span>
                    <span className="font-medium text-fg">{nameOf(t.toUserId)}</span>
                  </span>
                  <span className="font-mono tnum text-fg">{formatCents(t.amountCents)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Net por participante */}
      <div>
        <h2 className="eyebrow mb-2">Posição de cada um</h2>
        <ul className="card divide-y divide-hair2 p-2">
          {ctx.fullMembers.map((m) => {
            const net = balance.netByUser[m.id] ?? 0;
            return (
              <li key={m.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-[15px] text-fg">{m.name}</span>
                <span
                  className={`font-mono text-sm tnum ${
                    net > 0 ? "text-credit" : net < 0 ? "text-debt" : "text-fg-muted"
                  }`}
                >
                  {net > 0 ? "recebe " : net < 0 ? "deve " : ""}
                  {formatCents(Math.abs(net))}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Movimentos */}
      <div>
        <h2 className="eyebrow mb-2">Movimentos</h2>
        <ul>
          {contributions.map((c) => (
            <li key={`${c.source}-${c.id}`} className="row">
              <span className="chip shrink-0">{c.source === "settlement" ? "Acerto" : "Despesa"}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-fg">{c.description}</p>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
                  {new Date(c.date).toLocaleDateString("pt-PT")} · {formatCents(c.amountCents)}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {contributions.length === 0 ? (
          <p className="card p-8 text-center text-sm text-fg-muted">
            Ainda não há despesas partilhadas nem acertos.
          </p>
        ) : null}
      </div>
    </div>
  );
}
