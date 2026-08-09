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
  assetTotalValueCents,
  ownershipShare,
  derivePosition,
  formatCents,
  formatForeignCents,
  formatMonths,
  payoffMonth,
  summariseRates,
  INDEXANTES,
  buildCreditoPlano,
  parseCreditTerms,
  tipoDoCredito,
  type AssetKind,
  type AssetView,
  type CreditoPlano,
  type RatePeriod,
  type RateKind,
  type Trade,
} from "@/lib/domain";
import { FireCalculator } from "@/components/FireCalculator";
import { PlanoAviso } from "@/components/PlanoAviso";
import { AssetForm } from "@/components/AssetForm";
import {
  deleteAssetAction,
  fetchAssetQuoteAction,
  updateAssetPriceAction,
} from "@/app/(app)/actions";
import { InvestmentCard } from "./InvestmentCard";
import { RefreshQuotesButton } from "@/components/RefreshQuotesButton";
import { SuggestMissingSymbols } from "@/components/SuggestMissingSymbols";
import { tickerSuggestAvailable } from "@/lib/services/ticker-suggest";
import { buildPortfolioReturn } from "@/lib/services/portfolio-service";
import { refreshStalePrices } from "@/lib/services/quotes-service";

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
  // Preços em dia antes de ler os bens. Só vai à fonte o que estiver velho, e as
  // cotações são partilhadas, por isso cada símbolo é buscado uma vez por dia no
  // serviço inteiro. Nunca falha para o lado de deitar a página abaixo.
  const freshness = await refreshStalePrices(ctx.space.id).catch(() => []);
  const quoteDateOf = new Map(freshness.map((f) => [f.assetId, f.quoteDate]));
  const quoteProblemOf = new Map(freshness.map((f) => [f.assetId, f.problem]));
  // O fecho na moeda de origem, que é o número que as pessoas reconhecem.
  const quoteOriginalOf = new Map(
    freshness
      .filter((f) => f.quoteCents !== null && f.quoteCurrency)
      .map((f) => [f.assetId, { cents: f.quoteCents!, currency: f.quoteCurrency! }]),
  );

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
  // Para se poder dizer quem tem a outra parte de um bem comprado a meias. Só
  // nome e id: o campo não precisa de mais nada de ninguém.
  const memberOptions = ctx.members.map((m) => ({ id: m.id, name: m.name }));
  const semSimbolo = stored.filter((a) => a.kind === "investimento" && !a.symbol).length;
  const podeSugerir = tickerSuggestAvailable();
  const today = new Date().toISOString().slice(0, 10);
  const rates = summariseRates(assets, today);

  return (
    <div className="space-y-8">
      <PlanoAviso spaceId={ctx.space.id} plan={ctx.space.plan} kind="assets" />
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
                <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4">
                  <p className="label mb-0">{ASSET_KIND_LABELS[kind]}</p>
                  {/* Um botão só, para os investimentos, e só se algum tiver
                      símbolo. Com dezenas de posições ninguém carrega uma a uma. */}
                  {kind === "investimento" &&
                  stored.some((s) => s.kind === "investimento" && s.symbol) ? (
                    <RefreshQuotesButton />
                  ) : null}
                </div>

                {/* Depois de uma importação ficam dezenas de ativos sem símbolo,
                    e sem símbolo não há cotação, ganho nem rentabilidade. Só
                    aparece quando há mesmo algum por resolver. */}
                {kind === "investimento" && semSimbolo > 0 && podeSugerir ? (
                  <div className="border-b border-hair2 px-5 pb-4 pt-3">
                    <p className="mb-2 text-xs text-fg-faint">
                      {semSimbolo}{" "}
                      {semSimbolo === 1 ? "investimento está" : "investimentos estão"} sem
                      símbolo de bolsa, e por isso sem cotação, sem ganho e sem
                      rentabilidade.
                    </p>
                    <SuggestMissingSymbols />
                  </div>
                ) : null}
                {/*
                  Os investimentos em grelha de cartões; o resto continua em
                  linha. A diferença não é estética: numa carteira com uma dúzia
                  de ações o que se faz é PROCURAR uma, e para isso o emblema
                  com cor própria e o ticker em destaque valem mais do que uma
                  lista onde todas as linhas se parecem. Uma conta bancária ou
                  um imóvel não se procuram assim — são poucos e têm nome.
                */}
                {kind === "investimento" ? (
                  <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                    {(byKind.get(kind) ?? []).map((a) => (
                      <InvestmentCard
                        key={a.id}
                        data={{
                          id: a.id,
                          name: a.name,
                          // O símbolo vive no ativo gravado, não na vista
                          // calculada — e é dele que sai a cor do emblema.
                          symbol: stored.find((x) => x.id === a.id)?.symbol ?? null,
                          quantity: a.quantity ?? 0,
                          unitCostCents: a.unitCostCents ?? null,
                          unitPriceCents: a.unitPriceCents ?? null,
                          currentValueCents: a.currentValueCents,
                          gainCents: a.missingPrice ? null : a.gainCents,
                          gainPct: a.missingPrice ? null : a.gainPct,
                          tradeCount: (tradesByAsset.get(a.id) ?? []).length,
                        }}
                      />
                    ))}
                  </ul>
                ) : (
                  <ul className="divide-y divide-hair2">
                    {(byKind.get(kind) ?? []).map((a) => (
                      <AssetRow
                        key={a.id}
                        asset={a}
                        // O formulário edita o que está GRAVADO, não a posição
                        // derivada: senão gravar sem tocar em nada reescrevia a
                        // entrada manual com os números dos movimentos.
                        stored={stored.find((s) => s.id === a.id) ?? null}
                        quoteDate={quoteDateOf.get(a.id) ?? null}
                        quoteProblem={quoteProblemOf.get(a.id) ?? null}
                        quoteOriginal={quoteOriginalOf.get(a.id) ?? null}
                        today={today}
                        tradeCount={(tradesByAsset.get(a.id) ?? []).length}
                        members={memberOptions}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ))
        )}
      </section>
      ) : null}

      {view === "ativos" ? <PortfolioReturnSection spaceId={ctx.space.id} /> : null}

      {view === "ativos" || view === "dividas" ? (
        <AssetForm
          contexto={view === "dividas" ? "dividas" : "ativos"}
          members={memberOptions}
        />
      ) : null}

      <Link href="/relatorios" className="inline-block text-sm text-fg-muted hover:text-fg">
        Ver relatórios de despesa
      </Link>
    </div>
  );
}

/**
 * Rentabilidade da carteira, e a comparação com os índices.
 *
 * A comparação aplica ao índice os mesmos reforços nas mesmas datas. Dizer "o
 * S&P 500 subiu 20% e eu subi 8%" ignora que a maior parte do dinheiro pode ter
 * entrado no último mês, e nesse caso os 20% do índice nunca estiveram
 * disponíveis para esse dinheiro.
 */
async function PortfolioReturnSection({ spaceId }: { spaceId: string }) {
  const ret = await buildPortfolioReturn(spaceId).catch(() => null);
  if (!ret) return null;

  return (
    <section className="card p-6">
      <p className="eyebrow mb-4">Rentabilidade da carteira</p>

      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-fg-muted">Investido</p>
          <p className="mt-0.5 font-mono text-lg tnum text-fg">
            {formatCents(ret.investedCents)}
          </p>
        </div>
        <div>
          <p className="text-xs text-fg-muted">Vale hoje</p>
          <p className="mt-0.5 font-mono text-lg tnum text-fg">
            {formatCents(ret.currentValueCents)}
          </p>
        </div>
        <div>
          <p className="text-xs text-fg-muted">Taxa anual (TIR)</p>
          <p
            className={`mt-0.5 font-mono text-lg tnum ${
              ret.annualPct === null ? "text-fg-faint" : ret.annualPct >= 0 ? "text-credit" : "text-debt"
            }`}
          >
            {ret.annualPct === null
              ? "por calcular"
              : `${ret.annualPct >= 0 ? "+" : ""}${ret.annualPct.toFixed(1).replace(".", ",")}%`}
          </p>
        </div>
      </div>

      {ret.missingPrice > 0 ? (
        <p className="mt-3 text-xs text-fg-faint">
          {ret.missingPrice} investimento(s) sem preço atual: contam pelo que
          custaram, por isso o valor de hoje está por baixo do real.
        </p>
      ) : null}

      <div className="mt-6 border-t border-hair pt-5">
        <p className="label mb-1">E se tivesse ido para o índice?</p>
        <p className="mb-4 text-xs text-fg-faint">
          Os mesmos reforços, nas mesmas datas, aplicados a um ETF em euros. É a
          única comparação justa: um índice não recebe reforços, e comparar a
          subida dele com a tua trata todo o teu dinheiro como se tivesse
          entrado no primeiro dia.
        </p>

        <ul className="space-y-4">
          {ret.benchmarks.map((b) => (
            <li key={b.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-fg">{b.label}</p>
                {b.comparison ? (
                  <p
                    className={`font-mono text-sm tnum ${
                      b.comparison.differenceCents >= 0 ? "text-credit" : "text-debt"
                    }`}
                  >
                    {b.comparison.differenceCents >= 0 ? "+" : ""}
                    {formatCents(b.comparison.differenceCents)}
                  </p>
                ) : null}
              </div>
              {b.comparison ? (
                <p className="mt-0.5 text-xs text-fg-muted">
                  No índice terias{" "}
                  <span className="tnum text-fg">
                    {formatCents(b.comparison.benchmarkValueCents)}
                  </span>
                  , tens{" "}
                  <span className="tnum text-fg">
                    {formatCents(b.comparison.portfolioValueCents)}
                  </span>
                  .{" "}
                  {b.comparison.differenceCents >= 0
                    ? "Estás à frente."
                    : "Estás atrás."}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-fg-faint">{b.problem}</p>
              )}
              <p className="mt-0.5 text-[11px] text-fg-faint">
                {b.description}
                {b.symbol && b.lastDate
                  ? ` Cotação ${b.symbol}, fecho de ${new Date(`${b.lastDate}T00:00:00Z`).toLocaleDateString("pt-PT")}.`
                  : ""}
              </p>
              {/* Um índice cotado noutra moeda mede o mercado e o câmbio à
                  mistura. Dizê-lo evita que uma diferença vinda do dólar seja
                  lida como se viesse do mercado. */}
              {b.comparison && b.currency && b.currency !== "EUR" ? (
                <p className="mt-1 text-[11px] text-fg-muted">
                  Este está cotado em {b.currency}, por isso a diferença acima
                  inclui o câmbio e não é só mercado. É a alternativa que havia:
                  o equivalente em euros não deu cotações.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
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

/** "2029-01-01" lido como se fala. */
function formatDia(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function pct(n: number): string {
  return `${n.toFixed(2).replace(/0$/, "").replace(/[.,]$/, "").replace(".", ",")}%`;
}

/**
 * O plano de um crédito com períodos de taxa.
 *
 * O que se procura primeiro é a prestação de hoje, e logo a seguir a pergunta
 * que a app existe para responder: **quanto vai passar a ser quando a taxa
 * mudar**. Por isso o degrau vem em cima, antes do resto — é a informação que
 * um crédito misto tem e um crédito de taxa única não.
 *
 * Quando não há plano, mostra-se a razão em vez de nada. "Falta o valor da
 * Euribor" resolve-se em dez segundos; um espaço em branco não se resolve.
 */
function CreditoResumo({
  plano,
  periodos,
}: {
  plano: CreditoPlano;
  periodos: RatePeriod[];
}) {
  if (plano.problem) {
    return (
      <p className="mt-2 text-xs text-fg-faint">
        Crédito de taxa {tipoDoCredito(periodos) ?? "—"}, sem plano:{" "}
        <span className="text-fg-muted">{plano.problem}</span>
      </p>
    );
  }

  const atual = plano.tramos[0]!;
  const sobe =
    plano.nextPaymentCents !== null && plano.nextPaymentCents > atual.monthlyPaymentCents;

  return (
    <div className="mt-2 space-y-0.5 text-xs text-fg-muted">
      <p>
        <span className="tnum text-fg">{formatCents(atual.monthlyPaymentCents)}</span> por mês
        {" · "}
        <span className="tnum">{pct(atual.annualRatePct)}</span>
        {atual.origem.kind === "variavel" && atual.origem.indexante
          ? ` (${INDEXANTES[atual.origem.indexante]}${
              atual.origem.spreadPct ? ` + ${pct(atual.origem.spreadPct)}` : ""
            })`
          : " fixa"}
      </p>

      {/* O degrau. É a única coisa que um crédito misto sabe e um de taxa única
          não — e é por não a mostrar que a prestação antiga passava por eterna. */}
      {plano.nextPaymentCents !== null && plano.nextChangeOn ? (
        <p className={sobe ? "text-debt" : "text-credit"}>
          Em {formatDia(plano.nextChangeOn)} passa a{" "}
          <span className="tnum">{formatCents(plano.nextPaymentCents)}</span> por mês,{" "}
          {sobe ? "mais" : "menos"}{" "}
          <span className="tnum">
            {formatCents(Math.abs(plano.nextPaymentCents - atual.monthlyPaymentCents))}
          </span>
          .
        </p>
      ) : null}

      <p>
        Último pagamento em{" "}
        <span className="text-fg">
          {formatMonthYear(
            payoffMonth(
              atual.startsOn,
              plano.tramos.reduce((s, t) => s + t.months, 0),
            ),
          )}
        </span>
        {plano.totalInterestCents > 0 ? (
          <>
            {", com "}
            <span className="tnum text-debt">{formatCents(plano.totalInterestCents)}</span> de
            juros até lá
          </>
        ) : null}
        .
      </p>

      {/* Um plano que assenta na Euribor de hoje é um cenário. Deixar isto
          implícito era apresentar uma suposição como se fosse um facto. */}
      {plano.scenarioFrom ? (
        <p className="text-fg-faint">
          A partir de {formatDia(plano.scenarioFrom)} é um cenário: assenta no valor de hoje do
          indexante, que ninguém sabe qual será.
        </p>
      ) : null}
    </div>
  );
}

function AssetRow({
  asset: a,
  stored,
  quoteDate,
  quoteProblem,
  quoteOriginal,
  today,
  tradeCount,
  members,
}: {
  asset: AssetView;
  stored: Asset | null;
  members: { id: string; name: string }[];
  quoteDate: string | null;
  quoteProblem: string | null;
  /** O fecho na moeda da bolsa, quando não é euro. */
  quoteOriginal: { cents: number; currency: string } | null;
  today: string;
  tradeCount: number;
}) {
  const isInvestment = a.kind === "investimento";
  const isDebt = a.kind === "divida";
  // A quota vem do que está gravado, não da vista: a vista já traz o valor com
  // a quota aplicada, e voltar a aplicá-la aqui contava metade de metade.
  const quota = ownershipShare(stored ?? {});
  const quotaLabel = `${String(Math.round(quota * 1000) / 10).replace(".", ",")}%`;
  const rateLabel =
    a.rateKind === "fixa" || a.rateKind === "variavel"
      ? RATE_KIND_LABELS[a.rateKind as RateKind].toLowerCase()
      : null;

  /**
   * O crédito com períodos de taxa ganha ao cálculo de taxa única.
   *
   * Quando há períodos, é porque alguém escreveu que este crédito muda de taxa
   * numa data — e nesse caso mostrar a prestação de hoje até 2055 é dizer uma
   * coisa que se sabe falsa. Os dois nunca aparecem ao mesmo tempo: duas
   * prestações diferentes lado a lado não informam, confundem.
   */
  const terms = isDebt ? parseCreditTerms(stored?.creditTerms) : null;
  const credito = terms
    ? buildCreditoPlano({
        balanceCents: a.currentValueCents,
        startDate: today,
        maturityDate: stored?.maturityDate,
        periods: terms.periods,
        indexanteRates: terms.indexanteRates,
      })
    : null;

  // Só as dívidas têm plano de pagamento; os outros bens com taxa mostram
  // quanto rendem por ano, que é a mesma informação vista do outro lado.
  const plan =
    isDebt && !credito
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
                ? `, a ${formatCents(a.unitPriceCents)}`
                : ", sem preço atual"}
              {/* De quando é o preço. Sem isto, um valor velho passa por atual.
                  E **só se mostra a data quando ela é mesmo a deste preço**: se a
                  cotação veio mas não se conseguiu converter, não se gravou preço
                  nenhum, e carimbar o preço antigo com a data de hoje seria a
                  mentira mais convincente de todas. */}
              {quoteDate && !quoteProblem
                ? ` (fecho de ${new Date(`${quoteDate}T00:00:00Z`).toLocaleDateString("pt-PT")})`
                : ""}
              {/* O fecho como a bolsa o cota. A conta é toda em euros, mas
                  ninguém confere uma ação americana em euros: quem tem a AAPL vê
                  270 dólares no telemóvel e é esse número que quer reconhecer
                  aqui. Vai a seguir e mais apagado — o euro é que manda. */}
              {quoteOriginal && !quoteProblem ? (
                <span className="text-fg-faint/70">
                  {" · "}
                  {formatForeignCents(quoteOriginal.cents, quoteOriginal.currency)}
                </span>
              ) : null}
              {tradeCount > 0 ? ` · ${tradeCount} mov.` : ""}
            </>
          ) : (
            a.purchasedAt ?? ""
          )}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {isInvestment ? (
          <div className="flex items-center gap-1.5">
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
              <button type="submit" className="btn-ghost px-2 text-xs">
                Gravar
              </button>
            </form>

            {/* Ir buscar a cotação agora. Só aparece com símbolo: sem ele não há
                onde a ir buscar, e um botão que nunca funciona é pior do que
                nenhum. O outro botão grava o que está na caixa — são coisas
                diferentes e passam a dizer-se por nomes diferentes. */}
            {stored?.symbol ? (
              <form action={fetchAssetQuoteAction}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="symbol" value={stored.symbol} />
                <button
                  type="submit"
                  className="btn-ghost px-2 text-xs"
                  title={`Ir buscar a cotação de ${stored.symbol.toUpperCase()}`}
                  aria-label={`Ir buscar a cotação atual de ${a.name}`}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 8a6 6 0 1 1-1.76-4.24" />
                    <path d="M14 2v4h-4" />
                  </svg>
                </button>
              </form>
            ) : null}
          </div>
        ) : null}

        <div className="text-right">
          <p className="font-mono text-sm tnum text-fg">{formatCents(a.currentValueCents)}</p>
          {/* Com quota parcial, o número acima é só a tua parte. Dizer de quanto
              é que ele é parte evita a pergunta "porque é que isto está a
              menos?" — e evita a resposta errada, que seria alguém corrigir o
              valor para o dobro e passar a contar a casa toda. */}
          {quota < 1 ? (
            <p className="font-mono text-[11px] tnum text-fg-faint">
              {quotaLabel} de {formatCents(assetTotalValueCents(a))}
            </p>
          ) : null}
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

      {credito ? <CreditoResumo plano={credito} periodos={terms!.periods} /> : null}

      {/*
        Duas razões diferentes para não haver prazo, e a diferença importa a
        quem lê: numa a dívida cresce, na outra desce tão devagar que não acaba
        em vida útil nenhuma. Antes esta segunda aparecia como "100 anos" e uma
        soma de juros — um número inventado com ar de resposta.
      */}
      {plan && plan.neverPaysOff ? (
        <p className="mt-2 text-xs text-debt">
          {(plan.monthlyPaymentCents ?? 0) <= (plan.nextInterestCents ?? 0) ? (
            <>
              A prestação de {formatCents(plan.monthlyPaymentCents ?? 0)} não chega para os{" "}
              {formatCents(plan.nextInterestCents ?? 0)} de juro do mês: assim a dívida cresce.
            </>
          ) : (
            <>
              A prestação de {formatCents(plan.monthlyPaymentCents ?? 0)} cobre os{" "}
              {formatCents(plan.nextInterestCents ?? 0)} de juro por pouco e só abate{" "}
              {formatCents(plan.nextPrincipalCents ?? 0)} por mês: a este ritmo não salda em
              cem anos.
            </>
          )}
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

      {/* Porque é que não há preço. "Sem preço atual" sozinho não diz se falta
          o símbolo, se o símbolo está errado, ou se a fonte falhou, e são
          coisas diferentes com soluções diferentes. */}
      {isInvestment && (!quoteDate || quoteProblem) ? (
        <p className="mt-2 text-xs text-fg-faint">
          {stored?.symbol ? (
            <>
              Símbolo <span className="font-mono text-fg-muted">{stored.symbol}</span>:{" "}
              {quoteProblem ?? "ainda sem cotação. Confere em Plataforma, no teste da fonte."}
            </>
          ) : (
            <>
              Sem símbolo de bolsa: o preço é só o que escreveres. Mete-o no
              Editar (ex.: <span className="font-mono text-fg-muted">msft.us</span>) para
              passar a atualizar-se sozinho.
            </>
          )}
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
            members={members}
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
              maturityDate: stored?.maturityDate ?? null,
              // Já validado: o formulário nunca vê o `jsonb` em cru.
              creditTerms: terms,
              ownershipPct: stored?.ownershipPct ?? null,
              coOwnerMemberId: stored?.coOwnerMemberId ?? null,
              symbol: stored?.symbol ?? null,
            }}
          />
        </div>
      </details>
    </li>
  );
}
