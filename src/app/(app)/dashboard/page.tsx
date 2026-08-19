import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getSpaceBalance } from "@/lib/services/balance-service";
import { getRepository } from "@/lib/data";
import { generateDueRecurring } from "@/lib/services/recurring-service";
import { getAllReminders, pendingReminders } from "@/lib/services/reminder-service";
import { formatCents, streakDeRegistos } from "@/lib/domain";
import { ExpenseRow } from "@/components/ExpenseRow";
import { OnboardingCard } from "@/components/OnboardingCard";
import { InstallPrompt } from "@/components/InstallPrompt";
import { buildOnboarding } from "@/lib/domain";
import { cookies } from "next/headers";

export const metadata = { title: "Saldo · Rachar" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");
  const repo = getRepository();
  const nameOf = (id: string) => ctx.members.find((m) => m.id === id)?.name ?? id;

  // Gera ocorrências de recorrentes em atraso (idempotente, tolerante a
  // falhas). ANTES das leituras, de propósito: as despesas geradas têm de
  // aparecer nas listas deste mesmo render — mas as leituras que não dependem
  // dela (importações, rendimentos, lembretes) arrancam em paralelo.
  const [[{ transfers }, recent, categories], batches, income, todosLembretes] =
    await Promise.all([
      (async () => {
        await generateDueRecurring(ctx.space.id);
        return Promise.all([
          getSpaceBalance(ctx.space.id, ctx.fullMembers, ctx.viewerMemberId),
          repo.listExpenses({ spaceId: ctx.space.id, viewerId: ctx.viewerMemberId }),
          repo.listCategories(ctx.space.id),
        ]);
      })(),
      repo.listImportBatches(ctx.space.id).catch(() => []),
      repo.listIncome(ctx.space.id).catch(() => []),
      getAllReminders(ctx.spaces.map((s) => ({ id: s.id, name: s.name }))),
    ]);

  const pending = recent.filter((e) => e.status === "pending");
  const pendingApprovals = recent.filter((e) => e.approvalStatus === "pending");
  // Depois de fechar o período, as liquidadas saem daqui: o objetivo do fecho é
  // precisamente reduzir o ruído. Continuam visíveis em Despesas, recolhidas.
  const confirmed = recent
    .filter((e) => e.status === "confirmed" && !e.settledAt)
    .slice(0, 6);
  const settledCount = recent.filter((e) => e.settledAt).length;
  const categoryName = (id?: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "Sem categoria";
  // O ícone vem da categoria: as criadas em cada ambiente têm o seu.
  const categoryIcon = (id?: string | null) => categories.find((c) => c.id === id)?.icon ?? null;

  const totalToSettle = transfers.reduce((s, t) => s + t.amountCents, 0);

  // Primeiros passos: completam-se sozinhos a partir dos dados, e podem ser
  // dispensados por quem já sabe o que anda a fazer.
  const dispensado = cookies().get("rachar_onboarding")?.value === "off";
  const onboarding = dispensado
    ? null
    : buildOnboarding({
        expenseCount: recent.filter((e) => !e.deletedAt).length,
        memberCount: ctx.members.length,
        importCount: batches.length,
        incomeCount: income.length,
      });

  // Lembretes de importação: o aviso visual de que há extratos por trazer.
  const dueImports = pendingReminders(todosLembretes).filter(
    (r) => r.status.state !== "never",
  );

  /**
   * O streak: dias seguidos com registo FEITO pela própria pessoa (dia do
   * `createdAt`, a mesma régua da "última atividade" — um import conta como o
   * dia em que foi feito, não como trinta). Deriva das despesas que já estão
   * carregadas: sem tabela nova, sem pedido a mais.
   */
  const hojeISO = new Date().toISOString().slice(0, 10);
  const streak = streakDeRegistos(
    recent
      .filter((e) => e.createdBy === ctx.user.id)
      .map((e) => (e.createdAt ?? "").slice(0, 10))
      .filter(Boolean),
    hojeISO,
  );

  // Última atividade do próprio (REQ: ao entrar, ver as suas últimas datas).
  const fmtDate = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString("pt-PT") : "—";
  // "Registaste" = foste tu a meter os dados na app (independentemente de quem
  // pagou). É isto que responde a "quando é que atualizei isto pela última vez",
  // por isso o que se mostra é o DIA DO REGISTO, não a data da despesa.
  const myRegistered = [...recent]
    .filter((e) => e.createdBy === ctx.user.id)
    .sort((a, b) => ((a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1))[0];
  // "Pagaste" = és o pagador, tenha sido quem tenha sido a registar a despesa.
  const myPaid = [...recent]
    .filter((e) => e.payerId === ctx.viewerMemberId && e.status === "confirmed")
    .sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : -1))[0];
  const registeredByOther = myPaid ? myPaid.createdBy !== ctx.user.id : false;

  return (
    <div className="space-y-10">
      <BalanceHero
        transfers={transfers}
        totalToSettle={totalToSettle}
        nameOf={nameOf}
      />

      {onboarding ? <OnboardingCard onboarding={onboarding} /> : null}

      <InstallPrompt />

      {/*
        O streak só aparece quando existe (nada de "0 dias" a envergonhar), e
        um dia ainda sem registo mostra-o em risco em vez de o apagar às 00:01.
      */}
      {streak.atual >= 2 ? (
        <Link
          href="/despesas/nova"
          className="card flex items-center justify-between gap-4 p-4 transition-colors hover:border-fg/20"
        >
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-panel2 text-lg">
              🔥
            </span>
            <div>
              <p className="text-sm font-medium">
                {streak.atual} dias seguidos a registar
                {streak.recorde > streak.atual ? (
                  <span className="text-fg-faint"> · recorde: {streak.recorde}</span>
                ) : null}
              </p>
              <p className="text-xs text-fg-muted">
                {streak.registadoHoje
                  ? "Hoje já está. As contas em dia são isto."
                  : "Ainda não registaste hoje — é hoje que ele se mantém."}
              </p>
            </div>
          </div>
          <span className="text-fg-faint">→</span>
        </Link>
      ) : null}

      {pendingApprovals.length > 0 ? (
        <Link
          href="/aprovacoes"
          className="card flex items-center justify-between gap-4 border-debt/20 p-4 transition-colors hover:border-debt/40"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-debt/15 text-debt">✓</span>
            <div>
              <p className="text-sm font-medium">{pendingApprovals.length} despesa(s) por aprovar</p>
              <p className="text-xs text-fg-muted">Submetidas que aguardam a tua aprovação.</p>
            </div>
          </div>
          <span className="text-fg-faint">→</span>
        </Link>
      ) : null}

      {dueImports.length > 0 ? (
        <Link
          href="/importar"
          className="card flex items-center justify-between gap-4 p-4 transition-colors hover:border-fg/20"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-panel2 text-fg">↓</span>
            <div>
              <p className="text-sm font-medium">
                {dueImports.length === 1
                  ? dueImports[0]!.status.message
                  : `${dueImports.length} extratos por importar`}
              </p>
              <p className="text-xs text-fg-muted">
                {dueImports[0]!.status.fromDate
                  ? `Importar a partir de ${new Date(dueImports[0]!.status.fromDate!).toLocaleDateString("pt-PT")} · ${dueImports[0]!.spaceName}`
                  : `Ambiente: ${dueImports[0]!.spaceName}`}
              </p>
            </div>
          </div>
          <span className="text-fg-faint">→</span>
        </Link>
      ) : null}

      {pending.length > 0 ? (
        <Link
          href="/recorrentes"
          className="card flex items-center justify-between gap-4 p-4 transition-colors hover:border-fg/20"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-debt/15 text-debt">!</span>
            <div>
              <p className="text-sm font-medium">{pending.length} recorrente(s) por confirmar</p>
              <p className="text-xs text-fg-muted">Valores variáveis (luz, água, gás).</p>
            </div>
          </div>
          <span className="text-fg-faint">→</span>
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="eyebrow">Último registo teu</p>
          <p className="mt-1 text-[15px] font-medium tnum text-fg">
            {myRegistered ? fmtDate(myRegistered.createdAt ?? myRegistered.transactionDate) : "—"}
          </p>
          {myRegistered ? (
            <>
              <p className="mt-0.5 truncate text-xs text-fg-muted">{myRegistered.description}</p>
              <p className="mt-1 text-[11px] text-fg-faint">
                Dia em que meteste dados na app · despesa de{" "}
                {fmtDate(myRegistered.transactionDate)}
              </p>
            </>
          ) : (
            <p className="mt-1 text-[11px] text-fg-faint">Ainda não registaste nada aqui.</p>
          )}
        </div>
        <div className="card p-4">
          <p className="eyebrow">Última que pagaste</p>
          <p className="mt-1 text-[15px] font-medium tnum text-fg">
            {myPaid ? fmtDate(myPaid.transactionDate) : "—"}
          </p>
          {myPaid ? (
            <>
              <p className="mt-0.5 truncate text-xs text-fg-muted">{myPaid.description}</p>
              <p className="mt-1 text-[11px] text-fg-faint">
                Despesas em que és o pagador, tenha sido quem tenha sido a registá-las
                {registeredByOther ? " (esta foi registada por outra pessoa)" : ""}.
              </p>
            </>
          ) : (
            <p className="mt-1 text-[11px] text-fg-faint">Ainda não há despesas pagas por ti.</p>
          )}
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="eyebrow">Despesas recentes</h2>
          <Link href="/despesas" className="text-xs text-fg-muted transition-colors hover:text-fg">
            Ver todas →
          </Link>
        </div>
        {confirmed.length === 0 ? (
          settledCount > 0 ? (
            <SettledState count={settledCount} />
          ) : (
            <EmptyState />
          )
        ) : (
          <ul>
            {confirmed.map((e) => (
              <ExpenseRow
                key={e.id}
                expense={e}
                categoryName={categoryName(e.categoryId)}
                        categoryIcon={categoryIcon(e.categoryId)}
                payerName={nameOf(e.payerId)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BalanceHero({
  transfers,
  totalToSettle,
  nameOf,
}: {
  transfers: { fromUserId: string; toUserId: string; amountCents: number }[];
  totalToSettle: number;
  nameOf: (id: string) => string;
}) {
  if (transfers.length === 0) {
    return (
      <section className="pt-4">
        <p className="eyebrow">Saldo atual</p>
        <p className="mt-3 font-display text-5xl font-semibold tracking-tightest sm:text-6xl">
          Tudo acertado
        </p>
        <p className="mt-3 text-sm text-fg-muted">Ninguém deve nada a ninguém. ✦</p>
      </section>
    );
  }

  // Caso simples (2 pessoas): uma só transferência.
  if (transfers.length === 1) {
    const t = transfers[0]!;
    return (
      <Link href="/saldo" className="block pt-4">
        <p className="eyebrow">Saldo atual</p>
        <p className="mt-3 font-display text-6xl font-semibold tracking-tightest tnum sm:text-7xl">
          {formatCents(t.amountCents)}
        </p>
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-fg-muted">
          <span className="font-medium text-fg">{nameOf(t.fromUserId)}</span>
          <span>deve a</span>
          <span className="font-medium text-fg">{nameOf(t.toUserId)}</span>
          <span className="ml-1 text-xs text-fg-faint underline-offset-4">· ver detalhe →</span>
        </p>
      </Link>
    );
  }

  // N pessoas: vários pagamentos sugeridos.
  return (
    <Link href="/saldo" className="block pt-4">
      <p className="eyebrow">Por acertar</p>
      <p className="mt-3 font-display text-6xl font-semibold tracking-tightest tnum sm:text-7xl">
        {formatCents(totalToSettle)}
      </p>
      <p className="mt-4 text-[15px] text-fg-muted">
        {transfers.length} pagamento(s) sugerido(s) para zerar o saldo.
        <span className="ml-1 text-xs text-fg-faint">· ver detalhe →</span>
      </p>
    </Link>
  );
}

/** Período fechado: as despesas estão recolhidas, não desaparecidas. */
function SettledState({ count }: { count: number }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-8 text-center">
      <p className="text-sm text-fg-muted">
        Período fechado. {count} despesa(s) liquidada(s) estão recolhidas.
      </p>
      <Link href="/despesas" className="text-xs text-fg-muted underline-offset-4 hover:text-fg hover:underline">
        Ver em Despesas →
      </Link>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center gap-3 p-10 text-center">
      <p className="text-sm text-fg-muted">Ainda não há despesas neste ambiente.</p>
      <Link href="/despesas/nova" className="btn-primary">
        Adicionar a primeira
      </Link>
    </div>
  );
}
