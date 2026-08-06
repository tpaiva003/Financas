import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import type { Asset } from "@/lib/data";
import {
  ASSET_KIND_LABELS,
  RATE_KIND_LABELS,
  annualInterestCents,
  buildLoan,
  buildNetWorth,
  derivePosition,
  formatCents,
  formatMonths,
  payoffMonth,
  summariseRates,
  type AssetKind,
  type AssetView,
  type RateKind,
  type Trade,
} from "@/lib/domain";
import { FireCalculator } from "@/components/FireCalculator";
import { AssetForm } from "@/components/AssetForm";
import { deleteAssetAction, updateAssetPriceAction } from "@/app/(app)/actions";

export type PatrimonioView = "resumo" | "ativos" | "dividas" | "fire";

/**
 * Conteúdo do património, dividido em vistas.
 *
 * São perguntas diferentes e não se leem bem à mistura: quanto tenho ao todo,
 * o que tenho, o que devo, e para onde isto vai dar.
 */
export async function PatrimonioContent({ view }: { view: PatrimonioView }) {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");

  const repo = getRepository();
  // A tabela pode não existir se a migração 0013 ainda não correu.
  const stored: Asset[] = await repo.listAssets(ctx.space.id).catch(() => []);
  // Movimentos datados: quando existem, são eles que dizem quantas unidades se
  // tem e quanto custaram. A posição escrita à mão fica intocada por baixo.
  const trades = await repo.listAssetTrades(ctx.space.id).catch(() => []);
  const tradesByAsset = new Map<string, Trade[]>();
  for (const t of trades) {
    tradesByAsset.set(t.assetId, [...(tradesByAsset.get(t.assetId) ?? []), t as Trade]);
  }
  const assets = stored.map((a) => {
    const d = derivePosition(a, tradesByAsset.get(a.id) ?? []);
    return d.derived ? { ...a, quantity: d.quantity, unitCostCents: d.unitCostCents } : a;
  });
  const net = buildNetWorth(assets);

  // Gasto anual sugerido para o FIRE: a partir das despesas reais do ambiente,
  // média dos meses com movimento, para não contar meses vazios como zero.
  const expenses = await repo
    .listExpenses({ spaceId: ctx.space.id, viewerId: ctx.viewerMemberId })
    .catch(() => []);
  const byMonth = new Map<string, number>();
  for (const e of expenses) {
    if (e.status !== "confirmed" || e.deletedAt) continue;
    const ym = e.transactionDate.slice(0, 7);
    byMonth.set(ym, (byMonth.get(ym) ?? 0) + e.amountCents);
  }
  const monthlyAverage =
    byMonth.size > 0
      ? Math.round([...byMonth.values()].reduce((a, b) => a + b, 0) / byMonth.size)
      : 0;

  // Dívidas e ativos vivem na mesma tabela, separam-se aqui pela vista.
  const kindsToShow = (Object.keys(ASSET_KIND_LABELS) as AssetKind[]).filter((k) =>
    view === "dividas" ? k === "divida" : k !== "divida",
  );
  const byKind = new Map<AssetKind, AssetView[]>();
  for (const a of net.assets) {
    byKind.set(a.kind, [...(byKind.get(a.kind) ?? []), a]);
  }

  const shown = net.assets.filter((a) => kindsToShow.includes(a.kind));
  const rates = summariseRates(assets);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">{ctx.space.name}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          {view === "ativos"
            ? "Ativos"
            : view === "dividas"
              ? "Dívidas"
              : view === "fire"
                ? "Independência financeira"
                : "Património"}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          {view === "ativos"
            ? "Contas, investimentos e outros bens."
            : view === "dividas"
              ? "Créditos e outros valores em falta."
              : view === "fire"
                ? "Quanto precisas e quando lá chegas."
                : "O que tens menos o que deves, para saberes onde estás."}
        </p>
      </div>

      {view === "resumo" ? (
      <>
      <section className="card p-6">
        <p className="eyebrow">Património líquido</p>
        <p
          className={`mt-2 font-display text-5xl font-semibold tracking-tightest tnum ${
            net.netCents < 0 ? "text-debt" : ""
          }`}
        >
          {formatCents(net.netCents)}
        </p>
        <p className="mt-2 text-sm text-fg-muted">
          {formatCents(net.totalAssetsCents)} em bens
          {net.totalLiabilitiesCents > 0
            ? `, menos ${formatCents(net.totalLiabilitiesCents)} de dívidas`
            : ""}
          .
        </p>

        {net.investmentCostCents > 0 ? (
          <p className="mt-3 text-sm">
            Investimentos:{" "}
            <span className={net.investmentGainCents >= 0 ? "text-credit" : "text-debt"}>
              {net.investmentGainCents >= 0 ? "+" : ""}
              {formatCents(net.investmentGainCents)}
            </span>{" "}
            <span className="text-fg-faint">
              sobre {formatCents(net.investmentCostCents)} investidos
            </span>
          </p>
        ) : null}
        {net.investmentsMissingPrice > 0 ? (
          <p className="mt-1 text-xs text-fg-faint">
            {net.investmentsMissingPrice} investimento(s) sem preço atual. Enquanto
            faltar, contam pelo que custaram e ficam de fora do ganho, para o
            número não mentir.
          </p>
        ) : null}
      </section>

      {net.byKind.length > 0 ? (
        <section className="card p-5">
          <p className="eyebrow mb-3">Onde está</p>
          <ul className="space-y-3">
            {net.byKind.map((k) => {
              const max = Math.max(...net.byKind.map((x) => x.totalCents), 1);
              return (
                <li key={k.kind}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="text-fg">{k.label}</span>
                    <span className="font-mono tnum text-fg-muted">{formatCents(k.totalCents)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-panel2">
                    <div
                      className={`h-full rounded-full ${k.kind === "divida" ? "bg-debt" : "bg-credit"}`}
                      style={{ width: `${Math.max(2, (k.totalCents / max) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {rates.annualInterestCents > 0 || rates.annualDebtInterestCents > 0 ? (
        <section className="card p-5">
          <p className="eyebrow mb-2">Juros, num ano</p>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
            {rates.annualInterestCents > 0 ? (
              <p className="text-fg-muted">
                Recebes <span className="text-credit">{formatCents(rates.annualInterestCents)}</span>
              </p>
            ) : null}
            {rates.annualDebtInterestCents > 0 ? (
              <p className="text-fg-muted">
                Pagas <span className="text-debt">{formatCents(rates.annualDebtInterestCents)}</span>
              </p>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-fg-faint">
            À taxa registada em cada um, sobre o valor de hoje. É a conta que
            responde a amortizar ou investir: só compensa investir se render
            mais do que a dívida custa.
          </p>
        </section>
      ) : null}
      </>
      ) : null}

      {view === "fire" ? (
      <FireCalculator
        netWorthCents={net.netCents}
        suggestedAnnualExpensesCents={monthlyAverage * 12}
      />
      ) : null}

      {view === "dividas" && rates.amortisingCount > 0 ? (
        <section className="card p-5">
          <p className="eyebrow mb-3">O que sai todos os meses</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="font-display text-2xl font-semibold tracking-tight tnum">
                {formatCents(rates.monthlyPaymentsCents)}
              </p>
              <p className="mt-0.5 text-xs text-fg-muted">em prestações, por mês</p>
            </div>
            {rates.annualDebtInterestCents > 0 ? (
              <div>
                <p className="font-display text-2xl font-semibold tracking-tight tnum text-debt">
                  {formatCents(rates.annualDebtInterestCents)}
                </p>
                <p className="mt-0.5 text-xs text-fg-muted">de juros no próximo ano</p>
              </div>
            ) : null}
            {rates.lastPayoffMonths !== null ? (
              <div>
                <p className="font-display text-2xl font-semibold tracking-tight">
                  {formatMonthYear(payoffMonth(today, rates.lastPayoffMonths))}
                </p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  fica tudo pago, se nada mudar
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {view === "ativos" && rates.annualInterestCents > 0 ? (
        <section className="card p-5">
          <p className="eyebrow">Juros a receber</p>
          <p className="mt-1.5 font-display text-2xl font-semibold tracking-tight tnum text-credit">
            {formatCents(rates.annualInterestCents)}
          </p>
          <p className="mt-0.5 text-xs text-fg-muted">
            por ano, de {rates.earningCount}{" "}
            {rates.earningCount === 1 ? "bem com taxa registada" : "bens com taxa registada"}.
          </p>
        </section>
      ) : null}

      {view === "ativos" || view === "dividas" ? (
      <section className="space-y-3">
        {shown.length === 0 ? (
          <p className="card p-8 text-center text-sm text-fg-muted">
            {view === "dividas"
              ? "Não tens dívidas registadas."
              : "Ainda não registaste nada. Começa por uma conta ou um investimento."}
          </p>
        ) : (
          kindsToShow
            .filter((k) => (byKind.get(k) ?? []).length > 0)
            .map((kind) => (
              <div key={kind} className="card p-0">
                <p className="label mb-0 px-5 pt-4">{ASSET_KIND_LABELS[kind]}</p>
                <ul className="divide-y divide-hair2">
                  {(byKind.get(kind) ?? []).map((a) => (
                    <AssetRow
                      key={a.id}
                      asset={a}
                      // O formulário edita o que está GRAVADO, não a posição
                      // derivada: senão gravar sem tocar em nada reescrevia a
                      // entrada manual com os números dos movimentos.
                      stored={stored.find((s) => s.id === a.id) ?? null}
                      today={today}
                      tradeCount={(tradesByAsset.get(a.id) ?? []).length}
                    />
                  ))}
                </ul>
              </div>
            ))
        )}
      </section>
      ) : null}

      {view === "ativos" || view === "dividas" ? <AssetForm /> : null}

      <Link href="/relatorios" className="inline-block text-sm text-fg-muted hover:text-fg">
        Ver relatórios de despesa
      </Link>
    </div>
  );
}

/** "2054-05" lido como se fala. */
function formatMonthYear(ym: string | null): string {
  if (!ym) return "—";
  return new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("pt-PT", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function AssetRow({
  asset: a,
  stored,
  today,
  tradeCount,
}: {
  asset: AssetView;
  stored: Asset | null;
  today: string;
  tradeCount: number;
}) {
  const isInvestment = a.kind === "investimento";
  const isDebt = a.kind === "divida";
  const rateLabel =
    a.rateKind === "fixa" || a.rateKind === "variavel"
      ? RATE_KIND_LABELS[a.rateKind as RateKind].toLowerCase()
      : null;

  // Só as dívidas têm plano de pagamento; os outros bens com taxa mostram
  // quanto rendem por ano, que é a mesma informação vista do outro lado.
  const plan = isDebt
    ? buildLoan({
        principalCents: a.currentValueCents,
        annualRatePct: a.interestRatePct,
        termMonths: a.termMonths,
        monthlyPaymentCents: a.monthlyPaymentCents,
      })
    : null;
  const yearlyInterest =
    !isDebt && a.interestRatePct
      ? annualInterestCents(a.currentValueCents, a.interestRatePct)
      : 0;

  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        {isInvestment ? (
          <Link
            href={`/patrimonio/ativos/${a.id}`}
            className="truncate text-sm font-medium text-fg underline-offset-4 hover:underline"
          >
            {a.name} →
          </Link>
        ) : (
          <p className="truncate text-sm font-medium text-fg">{a.name}</p>
        )}
        <p className="mt-0.5 font-mono text-[11px] text-fg-faint">
          {isInvestment ? (
            <>
              {a.quantity} un. a {formatCents(a.unitCostCents ?? 0)}
              {a.unitPriceCents !== null && a.unitPriceCents !== undefined
                ? `, hoje a ${formatCents(a.unitPriceCents)}`
                : ", sem preço atual"}
              {tradeCount > 0 ? ` · ${tradeCount} mov.` : ""}
            </>
          ) : (
            a.purchasedAt ?? ""
          )}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {isInvestment ? (
          <form action={updateAssetPriceAction} className="flex items-center gap-1.5">
            <input type="hidden" name="id" value={a.id} />
            <label className="sr-only" htmlFor={`price-${a.id}`}>
              Preço atual de {a.name}
            </label>
            <input
              key={`price:${a.id}:${a.unitPriceCents ?? ""}`}
              id={`price-${a.id}`}
              name="unitPrice"
              inputMode="decimal"
              defaultValue={
                a.unitPriceCents === null || a.unitPriceCents === undefined
                  ? ""
                  : (a.unitPriceCents / 100).toFixed(2).replace(".", ",")
              }
              placeholder="preço"
              className="input h-9 w-24 py-1 text-xs"
            />
            <button type="submit" className="btn-ghost px-2 text-xs">Atualizar</button>
          </form>
        ) : null}

        <div className="text-right">
          <p className="font-mono text-sm tnum text-fg">{formatCents(a.currentValueCents)}</p>
          {a.gainCents !== null ? (
            <p className={`font-mono text-[11px] tnum ${a.gainCents >= 0 ? "text-credit" : "text-debt"}`}>
              {a.gainCents >= 0 ? "+" : ""}
              {formatCents(a.gainCents)}
              {a.gainPct !== null ? ` (${a.gainPct >= 0 ? "+" : ""}${Math.round(a.gainPct)}%)` : ""}
            </p>
          ) : null}
        </div>

        <form action={deleteAssetAction}>
          <input type="hidden" name="id" value={a.id} />
          <button type="submit" className="btn-ghost px-2 text-xs text-debt hover:text-debt">
            Remover
          </button>
        </form>
      </div>
      </div>

      {plan && plan.neverPaysOff ? (
        <p className="mt-2 text-xs text-debt">
          A prestação de {formatCents(plan.monthlyPaymentCents ?? 0)} não chega para os{" "}
          {formatCents(plan.nextInterestCents ?? 0)} de juro do mês: assim a dívida cresce.
        </p>
      ) : null}

      {plan && plan.monthsToPayOff !== null ? (
        <div className="mt-2 space-y-0.5 text-xs text-fg-muted">
          <p>
            <span className="tnum text-fg">{formatCents(plan.monthlyPaymentCents ?? 0)}</span> por
            mês{plan.paymentIsEstimated ? " (estimada pelo prazo)" : ""}
            {a.interestRatePct ? (
              <>
                {" · "}
                <span className="tnum">{String(a.interestRatePct).replace(".", ",")}%</span>
                {rateLabel ? ` ${rateLabel}` : ""}
              </>
            ) : null}
          </p>
          <p>
            Último pagamento em{" "}
            <span className="text-fg">
              {formatMonthYear(payoffMonth(today, plan.monthsToPayOff))}
            </span>
            , daqui a {formatMonths(plan.monthsToPayOff)}
            {plan.totalInterestCents ? (
              <>
                {", com "}
                <span className="tnum text-debt">{formatCents(plan.totalInterestCents)}</span> de
                juros até lá
              </>
            ) : null}
            .
          </p>
          {plan.nextInterestCents ? (
            <p className="text-fg-faint">
              Da próxima prestação, {formatCents(plan.nextInterestCents)} é juro e{" "}
              {formatCents(plan.nextPrincipalCents ?? 0)} abate mesmo à dívida.
            </p>
          ) : null}
        </div>
      ) : null}

      {yearlyInterest > 0 ? (
        <p className="mt-2 text-xs text-fg-muted">
          <span className="tnum">{String(a.interestRatePct).replace(".", ",")}%</span> ao ano
          {rateLabel ? `, ${rateLabel}` : ""}: rende cerca de{" "}
          <span className="tnum text-credit">{formatCents(yearlyInterest)}</span> por ano.
        </p>
      ) : null}

      {a.notes ? <p className="mt-2 text-xs text-fg-faint">{a.notes}</p> : null}

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-fg-faint transition-colors hover:text-fg">
          Editar
        </summary>
        <div className="mt-3 rounded-xl border border-hair bg-panel2/20 p-4">
          {tradeCount > 0 ? (
            <p className="mb-3 text-xs text-fg-faint">
              As unidades e o custo vêm dos {tradeCount} movimentos registados.
              O que escreveres aqui fica guardado, mas só volta a valer se
              apagares os movimentos.
            </p>
          ) : null}
          <AssetForm
            asset={{
              id: a.id,
              name: a.name,
              kind: a.kind,
              quantity: stored?.quantity ?? a.quantity,
              unitCostCents: stored?.unitCostCents ?? a.unitCostCents,
              unitPriceCents: a.unitPriceCents,
              valueCents: a.valueCents,
              purchasedAt: a.purchasedAt,
              notes: a.notes,
              interestRatePct: a.interestRatePct,
              monthlyPaymentCents: a.monthlyPaymentCents,
              termMonths: a.termMonths,
              rateKind: a.rateKind,
            }}
          />
        </div>
      </details>
    </li>
  );
}
