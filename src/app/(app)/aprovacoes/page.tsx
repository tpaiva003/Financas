import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { formatCents } from "@/lib/domain";
import { approveExpenseAction, rejectExpenseAction } from "@/app/(app)/actions";

export const metadata = { title: "Aprovações · Finanças" };
export const dynamic = "force-dynamic";

export default async function AprovacoesPage() {
  const ctx = await getSpaceContext();
  // Só membros plenos aprovam.
  if (ctx.viewerRole === "submitter") redirect("/despesas");

  const repo = getRepository();
  const [expenses, categories] = await Promise.all([
    repo.listExpenses({ spaceId: ctx.space.id, viewerId: ctx.viewerMemberId }),
    repo.listCategories(ctx.space.id),
  ]);
  const pending = expenses
    .filter((e) => e.approvalStatus === "pending")
    .sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : -1));

  const nameOf = (id?: string | null) =>
    id ? ctx.members.find((m) => m.id === id)?.name ?? id : "—";
  const catName = (id?: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "Sem categoria";

  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">{ctx.space.name}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          Aprovações {pending.length > 0 ? <span className="text-fg-muted">· {pending.length}</span> : null}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          Despesas submetidas que aguardam aprovação para entrarem no saldo.
        </p>
      </div>

      {pending.length === 0 ? (
        <p className="card p-10 text-center text-sm text-fg-muted">
          Não há despesas por aprovar. ✦
        </p>
      ) : (
        <ul className="space-y-3">
          {pending.map((e) => (
            <li key={e.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-fg">{e.description}</p>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
                    {new Date(e.transactionDate).toLocaleDateString("pt-PT")} · {catName(e.categoryId)} · paga {nameOf(e.payerId)}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
                    submetida por {nameOf(e.submittedBy)}
                    {e.approverId ? ` · aprovador: ${nameOf(e.approverId)}` : ""}
                  </p>
                </div>
                <div className="shrink-0 font-mono text-[15px] tnum text-fg">
                  {formatCents(e.amountCents, e.currency)}
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <form action={approveExpenseAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <button type="submit" className="btn-primary text-sm">Aprovar</button>
                </form>
                <form action={rejectExpenseAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <button type="submit" className="btn-ghost text-sm text-debt hover:text-debt">Rejeitar</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link href="/despesas" className="inline-block text-sm text-fg-muted hover:text-fg">
        ← Voltar às despesas
      </Link>
    </div>
  );
}
