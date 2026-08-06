import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import {
  ASSET_KIND_LABELS,
  TRADE_KIND_LABELS,
  buildPosition,
  buildPositionReturn,
  formatCents,
  formatRate,
  type AssetKind,
  type Trade,
  type TradeKind,
} from "@/lib/domain";
import { TradeForm } from "@/components/TradeForm";
import {
  deleteAssetTradeAction,
  fetchAssetQuoteAction,
  updateAssetPriceAction,
} from "@/app/(app)/actions";
import { refreshStalePrices } from "@/lib/services/quotes-service";

export const metadata = { title: "Investimento · Rachar" };
export const dynamic = "force-dynamic";

/**
 * Um investimento ao pormenor: o que se tem, como lá se chegou, e o que rendeu.
 *
 * É aqui que a carteira deixa de ser uma fotografia e passa a ter história. A
 * TIR só é possível porque os movimentos têm data: sem elas, um euro metido o
 * mês passado contaria como um euro metido há cinco anos.
 */
export default async function AtivoPage({ params }: { params: { id: string } }) {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");

  const repo = getRepository();
  // Preço em dia antes de mostrar o que quer que seja, senão as contas desta
  // página assentam num valor do dia em que alguém carregou no botão.
  const freshness = await refreshStalePrices(ctx.space.id).catch(() => []);
  const assets = await repo.listAssets(ctx.space.id).catch(() => []);
  const asset = assets.find((a) => a.id === params.id);
  if (!asset) notFound();
  const quoteDate = freshness.find((f) => f.assetId === asset.id)?.quoteDate ?? null;

  const trades = await repo.listAssetTrades(ctx.space.id, asset.id).catch(() => []);
  const today = new Date().toISOString().slice(0, 10);

  const position = buildPosition(trades as Trade[]);
  const hasTrades = trades.length > 0;
  // Sem movimentos, a posição é a que está escrita no ativo.
  const quantity = hasTrades ? position.quantity : (asset.quantity ?? 0);
  const ret = hasTrades ? buildPositionReturn(position, asset.unitPriceCents, today) : null;

  const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-PT");

  return (
    <div className="space-y-8">
      <div>
        <Link href="/patrimonio/ativos" className="eyebrow hover:text-fg">
          ← Ativos
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">{asset.name}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {ASSET_KIND_LABELS[asset.kind as AssetKind] ?? asset.kind}
          {hasTrades ? ` · ${trades.length} movimento(s)` : ""}
        </p>
      </div>

      {position.oversold ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          Há vendas de mais unidades do que as que estavam registadas. Falta
          alguma compra, e enquanto faltar os números desta página não fecham.
        </p>
      ) : null}

      <section className="card p-6">
        <p className="eyebrow">Vale hoje</p>
        <p className="mt-2 font-display text-4xl font-semibold tracking-tightest tnum">
          {formatCents(ret ? ret.currentValueCents : Math.round(quantity * (asset.unitPriceCents ?? asset.unitCostCents ?? 0)))}
        </p>
        <p className="mt-2 text-sm text-fg-muted">
          {quantity} unidades
          {position.unitCostCents !== null || asset.unitCostCents
            ? `, a um custo médio de ${formatCents(position.unitCostCents ?? asset.unitCostCents ?? 0)}`
            : ""}
          {asset.unitPriceCents
            ? `, a ${formatCents(asset.unitPriceCents)}`
            : ". Sem cotação, conta pelo que custou"}
          .
        </p>

        {/* De quando é o preço. Um valor velho que se apresenta como atual é
            pior do que não ter valor: as contas que dependem dele ficam erradas
            sem dar sinal. */}
        {asset.unitPriceCents ? (
          <p className="mt-1 text-xs text-fg-faint">
            {quoteDate ? (
              <>
                Fecho de {new Date(`${quoteDate}T00:00:00Z`).toLocaleDateString("pt-PT")}
                {quoteDate < today ? ", atualizado sozinho quando há bolsa" : ""}.
              </>
            ) : (
              "Preço escrito à mão. Indica o símbolo da bolsa para passar a atualizar-se sozinho."
            )}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          {/* À mão continua a valer: nem tudo tem símbolo, e nem toda a gente
              quer depender de uma fonte externa para ver a sua carteira. */}
          <form action={updateAssetPriceAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={asset.id} />
            <div>
              <label className="label" htmlFor="preco">Preço atual por unidade</label>
              <input
                key={`p:${asset.id}:${asset.unitPriceCents ?? ""}`}
                id="preco"
                name="unitPrice"
                inputMode="decimal"
                defaultValue={
                  asset.unitPriceCents === null || asset.unitPriceCents === undefined
                    ? ""
                    : (asset.unitPriceCents / 100).toFixed(2).replace(".", ",")
                }
                placeholder="125,00"
                className="input w-36"
              />
            </div>
            <button type="submit" className="btn-ghost h-11 px-3 text-xs">Gravar</button>
          </form>

          {asset.symbol ? (
            <form action={fetchAssetQuoteAction}>
              <input type="hidden" name="id" value={asset.id} />
              <input type="hidden" name="symbol" value={asset.symbol} />
              <button type="submit" className="btn-ghost h-11 px-3 text-xs">
                Buscar cotação ({asset.symbol})
              </button>
            </form>
          ) : null}
        </div>

        {!asset.symbol ? (
          <p className="mt-2 text-xs text-fg-faint">
            Sem símbolo de bolsa, o preço é sempre escrito à mão. Podes indicá-lo
            em Ativos, no Editar deste investimento.
          </p>
        ) : null}
      </section>

      {ret ? (
        <section className="card p-6">
          <p className="eyebrow mb-4">O que rendeu</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-xs text-fg-muted">Investido</p>
              <p className="mt-0.5 font-mono text-lg tnum text-fg">
                {formatCents(position.investedCents)}
              </p>
            </div>
            <div>
              <p className="text-xs text-fg-muted">Ganho total</p>
              <p
                className={`mt-0.5 font-mono text-lg tnum ${
                  (ret.totalGainCents ?? 0) >= 0 ? "text-credit" : "text-debt"
                }`}
              >
                {ret.totalGainCents === null ? (
                  <span className="text-fg-faint">sem cotação</span>
                ) : (
                  <>
                    {ret.totalGainCents >= 0 ? "+" : ""}
                    {formatCents(ret.totalGainCents)}
                    {ret.simpleReturnPct !== null
                      ? ` (${ret.simpleReturnPct >= 0 ? "+" : ""}${Math.round(ret.simpleReturnPct)}%)`
                      : ""}
                  </>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-fg-muted">Taxa anual do teu dinheiro (TIR)</p>
              <p
                className={`mt-0.5 font-mono text-lg tnum ${
                  ret.annualPct === null ? "text-fg-faint" : ret.annualPct >= 0 ? "text-credit" : "text-debt"
                }`}
              >
                {ret.annualPct === null
                  ? "por calcular"
                  : `${ret.annualPct >= 0 ? "+" : ""}${ret.annualPct.toFixed(1).replace(".", ",")}% ao ano`}
              </p>
            </div>
            {position.dividendsCents > 0 || position.realizedGainCents !== 0 ? (
              <div>
                <p className="text-xs text-fg-muted">Já realizado</p>
                <p className="mt-0.5 font-mono text-lg tnum text-fg">
                  {formatCents(position.realizedGainCents)}
                  {position.dividendsCents > 0
                    ? ` (${formatCents(position.dividendsCents)} de dividendos)`
                    : ""}
                </p>
              </div>
            ) : null}
          </div>
          <p className="mt-4 text-xs text-fg-faint">
            A TIR conta com <strong className="font-medium text-fg-muted">quando</strong> é que
            cada euro entrou. Um reforço feito no mês passado não teve tempo de
            render um ano, e a percentagem simples trata-o como se tivesse.
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="eyebrow">Movimentos</h2>
        {trades.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-fg-muted">
              Ainda não há movimentos. A posição é a que escreveste à mão.
            </p>
            <p className="mx-auto mt-2 max-w-md text-xs text-fg-faint">
              Assim que registares o primeiro, a quantidade e o custo passam a
              sair daqui, e fica a saber-se o que o dinheiro rendeu ao ano.
            </p>
          </div>
        ) : (
          <ul className="card divide-y divide-hair2 p-0">
            {[...trades]
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">
                      {TRADE_KIND_LABELS[t.kind as TradeKind] ?? t.kind}
                      {t.quantity ? (
                        <span className="ml-2 font-mono text-xs text-fg-muted">
                          {t.quantity} un.
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-fg-faint">
                      {fmtDate(t.date)}
                      {t.currency && t.originalAmountCents && t.fxRate
                        ? ` · ${(t.originalAmountCents / 100).toFixed(2).replace(".", ",")} ${t.currency} a ${formatRate(t.fxRate)}`
                        : ""}
                    </p>
                    {t.notes ? <p className="mt-1 text-xs text-fg-faint">{t.notes}</p> : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-mono text-sm tnum ${
                        t.kind === "compra" || t.kind === "custo" ? "text-fg" : "text-credit"
                      }`}
                    >
                      {t.kind === "compra" || t.kind === "custo" ? "" : "+"}
                      {formatCents(t.amountCents)}
                    </span>
                    <form action={deleteAssetTradeAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" className="btn-ghost px-2 text-xs text-debt hover:text-debt">
                        Remover
                      </button>
                    </form>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>

      <TradeForm assetId={asset.id} assetName={asset.name} />
    </div>
  );
}
