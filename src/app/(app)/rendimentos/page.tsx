import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import type { Income } from "@/lib/data";
import {
  buildSavingsRate,
  formatCents,
  INCOME_KIND_LABELS,
  isPassive,
  type IncomeKind,
} from "@/lib/domain";
import { IncomeForm } from "@/components/IncomeForm";
import { deleteIncomeAction } from "@/app/(app)/actions";

export const metadata = { title: "Rendimentos · Rachar" };
export const dynamic = "force-dynamic";

/**
 * Rendimentos e taxa de poupança.
 *
 * Vive dentro da secção dos movimentos porque é a outra metade da mesma coisa:
 * o dinheiro que entra. Sem ele, a app só sabia para onde ia.
 */
export default async function RendimentosPage() {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");

  const repo = getRepository();
  // Juntas: nenhuma precisa da outra, e eram duas latências somadas.
  const [income, expenses] = (await Promise.all([
    repo.listIncome(ctx.space.id).catch(() => []),
    repo.listExpenses({ spaceId: ctx.space.id, viewerId: ctx.viewerMemberId }).catch(() => []),
  ])) as [Income[], Awaited<ReturnType<typeof repo.listExpenses>>];

  const month = new Date().toISOString().slice(0, 7);
  const monthExpenses = expenses
    .filter((e) => e.status === "confirmed" && !e.deletedAt && e.transactionDate.slice(0, 7) === month)
    .reduce((s, e) => s + e.amountCents, 0);

  const rate = buildSavingsRate(income, monthExpenses, month);
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("pt-PT", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">{ctx.space.name}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Rendimentos</h1>
        <p className="mt-1 text-sm text-fg-muted">
          O que entra: ordenado, trabalhos paralelos, juros, dividendos, rendas.
          É isto que torna a taxa de poupança um número real e não um palpite.
        </p>
      </div>

      <section className="card p-6">
        <p className="eyebrow">Taxa de poupança · {monthLabel}</p>
        {rate.ratePct === null ? (
          <>
            <p className="mt-2 font-display text-4xl font-semibold tracking-tight text-fg-faint">
              {/* Símbolo de campo vazio, não pontuação. */}
              &mdash;
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              Regista o que recebeste este mês para saber quanto ficou.
            </p>
          </>
        ) : (
          <>
            <p
              className={`mt-2 font-display text-5xl font-semibold tracking-tightest tnum ${
                rate.ratePct < 0 ? "text-debt" : "text-credit"
              }`}
            >
              {Math.round(rate.ratePct)}%
            </p>
            <p className="mt-2 text-sm text-fg-muted">
              Entraram <span className="text-fg">{formatCents(rate.incomeCents)}</span>, saíram{" "}
              <span className="text-fg">{formatCents(rate.expensesCents)}</span>, ficaram{" "}
              <span className={rate.savedCents < 0 ? "text-debt" : "text-credit"}>
                {formatCents(rate.savedCents)}
              </span>
              .
            </p>
            {rate.savedCents < 0 ? (
              <p className="mt-1 text-sm text-debt">
                Gastaste mais do que recebeste este mês.
              </p>
            ) : null}
          </>
        )}

        {rate.passiveIncomeCents > 0 ? (
          <div className="mt-4 border-t border-hair pt-4">
            <p className="text-sm text-fg-muted">
              Rendimento passivo (juros, dividendos, rendas):{" "}
              <span className="text-fg">{formatCents(rate.passiveIncomeCents)}</span>
              {rate.passiveCoveragePct !== null ? (
                <>
                  , que já paga{" "}
                  <span className="text-credit">{Math.round(rate.passiveCoveragePct)}%</span> das
                  tuas despesas.
                </>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-fg-faint">
              É o mesmo indicador da independência financeira, mas com dinheiro
              que entrou mesmo, em vez de uma projeção sobre o património.
            </p>
          </div>
        ) : null}
      </section>

      {rate.byKind.length > 0 ? (
        <section className="card p-5">
          <p className="eyebrow mb-3">De onde veio, este mês</p>
          <ul className="space-y-3">
            {rate.byKind.map((k) => {
              const max = Math.max(...rate.byKind.map((x) => x.amountCents), 1);
              return (
                <li key={k.kind}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="text-fg">
                      {k.label}
                      {isPassive(k.kind) ? (
                        <span className="chip ml-2 border-credit/30 text-credit">passivo</span>
                      ) : null}
                    </span>
                    <span className="font-mono tnum text-fg-muted">
                      {formatCents(k.amountCents)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-panel2">
                    <div
                      className={`h-full rounded-full ${isPassive(k.kind) ? "bg-credit" : "bg-fg/50"}`}
                      style={{ width: `${Math.max(2, (k.amountCents / max) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <IncomeForm />

      <section className="space-y-3">
        <h2 className="eyebrow">Registados</h2>
        {income.length === 0 ? (
          <p className="card p-8 text-center text-sm text-fg-muted">
            Ainda não registaste nenhum rendimento.
          </p>
        ) : (
          <ul className="card divide-y divide-hair2 p-0">
            {income.slice(0, 40).map((i) => (
              <li key={i.id} className="px-5 py-3.5">
                <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-sm font-medium text-fg">
                    {i.description}
                    {i.recurring ? (
                      <span className="chip border-hair text-fg-faint">todos os meses</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
                    {new Date(i.date).toLocaleDateString("pt-PT")} ·{" "}
                    {INCOME_KIND_LABELS[i.kind as IncomeKind] ?? i.kind}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm tnum text-credit">
                    {formatCents(i.amountCents)}
                  </span>
                  <form action={deleteIncomeAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <button type="submit" className="btn-ghost px-2 text-xs text-debt hover:text-debt">
                      Remover
                    </button>
                  </form>
                </div>
                </div>

                {/* A correção por baixo e não ao lado: numa linha só, num
                    telemóvel, o valor e três botões espremem-se uns aos
                    outros. Fechada por omissão — quem entra aqui vem quase
                    sempre registar, não corrigir. */}
                <div className="mt-1">
                  <IncomeForm
                    existente={{
                      id: i.id,
                      kind: i.kind,
                      description: i.description,
                      amountCents: i.amountCents,
                      date: i.date,
                      recurring: i.recurring,
                      notes: i.notes ?? null,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
