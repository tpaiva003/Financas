import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getRepository } from "@/lib/data";
import { householdUsers, userById } from "@/lib/users";
import { ExpenseRow } from "@/components/ExpenseRow";
import type { ExpenseKind } from "@/lib/domain";

export const metadata = { title: "Despesas — Finanças" };
export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  categoryId?: string;
  payerId?: string;
  kind?: string;
  from?: string;
  to?: string;
  status?: string;
}

export default async function DespesasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const repo = getRepository();
  const categories = await repo.listCategories();
  const users = householdUsers();

  const kind =
    searchParams.kind === "shared" || searchParams.kind === "personal"
      ? (searchParams.kind as ExpenseKind)
      : undefined;

  let expenses = await repo.listExpenses({
    viewerId: user.id,
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

  const total = expenses
    .filter((e) => e.kind === "shared")
    .reduce((acc, e) => acc + e.amountCents, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Despesas</h1>
        <Link href="/despesas/nova" className="btn-primary">
          + Adicionar
        </Link>
      </div>

      {/* Filtros (GET form — sem JS) */}
      <form className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-4" method="get">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="q">
            Pesquisar
          </label>
          <input
            id="q"
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="descrição…"
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="categoryId">
            Categoria
          </label>
          <select id="categoryId" name="categoryId" defaultValue={searchParams.categoryId ?? ""} className="input">
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="kind">
            Tipo
          </label>
          <select id="kind" name="kind" defaultValue={searchParams.kind ?? ""} className="input">
            <option value="">Todas</option>
            <option value="shared">Partilhada</option>
            <option value="personal">Pessoal</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="payerId">
            Quem pagou
          </label>
          <select id="payerId" name="payerId" defaultValue={searchParams.payerId ?? ""} className="input">
            <option value="">Ambos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="from">
            De
          </label>
          <input id="from" type="date" name="from" defaultValue={searchParams.from ?? ""} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="to">
            Até
          </label>
          <input id="to" type="date" name="to" defaultValue={searchParams.to ?? ""} className="input" />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary flex-1">
            Filtrar
          </button>
          <Link href="/despesas" className="btn-secondary">
            Limpar
          </Link>
        </div>
      </form>

      <p className="text-sm text-slate-500">
        {expenses.length} despesa(s) · total partilhado nesta vista:{" "}
        <span className="font-medium text-slate-700">
          {(total / 100).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}
        </span>
      </p>

      {expenses.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          Nenhuma despesa corresponde aos filtros.
        </div>
      ) : (
        <ul className="space-y-2">
          {expenses.map((e) => (
            <ExpenseRow
              key={e.id}
              expense={e}
              categoryName={categoryName(e.categoryId)}
              payerName={userById(e.payerId)?.name ?? e.payerId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
