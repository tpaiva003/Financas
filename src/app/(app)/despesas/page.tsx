import Link from "next/link";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { ExpenseRow } from "@/components/ExpenseRow";
import { ExpensesFilter } from "@/components/ExpensesFilter";
import type { Expense, ExpenseKind } from "@/lib/domain";

export const metadata = { title: "Despesas · Rachar" };
export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  categoryId?: string;
  payerId?: string;
  kind?: string;
  from?: string;
  to?: string;
  status?: string;
  liquidadas?: string;
}

function byDateDesc(a: Expense, b: Expense): number {
  if (a.transactionDate !== b.transactionDate) return a.transactionDate < b.transactionDate ? 1 : -1;
  return (a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1;
}

function groupByDate(items: Expense[]): { date: string; items: Expense[] }[] {
  const groups: { date: string; items: Expense[] }[] = [];
  for (const e of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.transactionDate) last.items.push(e);
    else groups.push({ date: e.transactionDate, items: [e] });
  }
  return groups;
}

function dateHeader(iso: string): string {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  const yestIso = yest.toISOString().slice(0, 10);
  if (iso === todayIso) return "Hoje";
  if (iso === yestIso) return "Ontem";
  return new Date(iso).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default async function DespesasPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getSpaceContext();
  const repo = getRepository();
  const categories = await repo.listCategories(ctx.space.id);
  const nameOf = (id: string) => ctx.members.find((m) => m.id === id)?.name ?? id;

  const kind =
    searchParams.kind === "shared" || searchParams.kind === "personal"
      ? (searchParams.kind as ExpenseKind)
      : undefined;

  let expenses = await repo.listExpenses({
    spaceId: ctx.space.id,
    viewerId: ctx.viewerMemberId,
    query: searchParams.q,
    categoryId: searchParams.categoryId,
    payerId: searchParams.payerId,
    kind,
    from: searchParams.from,
    to: searchParams.to,
  });

  if (searchParams.status === "pending") {
    expenses = expenses.filter((e) => e.status === "pending");
  }

  const categoryName = (id?: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "Sem categoria";

  const openExpenses = expenses.filter((e) => !e.settledAt).sort(byDateDesc);
  const settledExpenses = expenses.filter((e) => e.settledAt).sort(byDateDesc);
  const groups = groupByDate(openExpenses);

  // As liquidadas ficam escondidas por omissão: já foram acertadas, só fazem
  // ruído. Ficam a um clique, sem sair da página.
  const showSettled = searchParams.liquidadas === "1";
  const qs = new URLSearchParams(
    Object.entries(searchParams).filter(([k, v]) => v && k !== "liquidadas") as [string, string][],
  );
  const hideSettledHref = `/despesas${qs.toString() ? `?${qs}` : ""}`;
  qs.set("liquidadas", "1");
  const showSettledHref = `/despesas?${qs}`;

  return (
    <div className="space-y-7">
      <div className="flex items-end justify-between">
        <div>
          <p className="eyebrow">{ctx.space.name}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Despesas</h1>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <Link href="/importar" className="btn-secondary">Importar extrato</Link>
          <Link href="/despesas/nova" className="btn-primary">Adicionar</Link>
        </div>
      </div>

      <ExpensesFilter
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        members={ctx.members.map((m) => ({ id: m.id, name: m.name }))}
        initial={{
          q: searchParams.q ?? "",
          categoryId: searchParams.categoryId ?? "",
          payerId: searchParams.payerId ?? "",
          kind: searchParams.kind ?? "",
          from: searchParams.from ?? "",
          to: searchParams.to ?? "",
        }}
      />

      {expenses.length === 0 ? (
        <div className="card p-10 text-center text-sm text-fg-muted">
          Nenhuma despesa corresponde aos filtros.
        </div>
      ) : (
        <>
          {groups.length > 0 ? (
            <div className="space-y-5">
              {groups.map((g) => (
                <section key={g.date}>
                  <h2 className="mb-1.5 px-1 font-mono text-[11px] uppercase tracking-[0.1em] text-fg-faint">
                    {dateHeader(g.date)}
                  </h2>
                  <ul>
                    {g.items.map((e) => (
                      <ExpenseRow
                        key={e.id}
                        expense={e}
                        categoryName={categoryName(e.categoryId)}
                        payerName={nameOf(e.payerId)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <div className="card p-8 text-center text-sm text-fg-muted">
              Tudo acertado. Não há despesas em aberto.
            </div>
          )}

          {settledExpenses.length > 0 ? (
            showSettled ? (
              <section className="mt-6">
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-faint">
                    {settledExpenses.length} liquidada(s) · período fechado
                  </h2>
                  <Link
                    href={hideSettledHref}
                    className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-faint hover:text-fg"
                  >
                    ocultar
                  </Link>
                </div>
                <ul className="opacity-50">
                  {settledExpenses.map((e) => (
                    <ExpenseRow
                      key={e.id}
                      expense={e}
                      categoryName={categoryName(e.categoryId)}
                      payerName={nameOf(e.payerId)}
                    />
                  ))}
                </ul>
              </section>
            ) : (
              /* Já acertadas: fora de vista por omissão, a um clique de distância. */
              <p className="pt-2 text-center">
                <Link
                  href={showSettledHref}
                  className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-faint transition-colors hover:text-fg-muted"
                >
                  {settledExpenses.length} liquidada(s) · mostrar
                </Link>
              </p>
            )
          ) : null}
        </>
      )}
    </div>
  );
}
