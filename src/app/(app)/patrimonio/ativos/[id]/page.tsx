import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { lerAtivos } from "@/lib/data/leituras";
import {
  ASSET_KIND_LABELS,
  TRADE_KIND_LABELS,
  buildPosition,
  buildPositionReturn,
  movimentosImplausiveis,
  aplicarSplits,
  detetarSplits,
  ratioPorExtenso,
  formatCents,
  formatForeignCents,
  formatRate,
  type AssetKind,
  type Trade,
  type TradeKind,
} from "@/lib/domain";
import { TradeForm } from "@/components/TradeForm";
import { TradeRow } from "@/components/TradeRow";
import { AssetAttachments } from "@/components/AssetAttachments";
import { SplitSugerido } from "@/components/SplitSugerido";
import { SplitManual } from "@/components/SplitManual";
import {
  deleteAssetTradeAction,
  fetchAssetQuoteAction,
  updateAssetPriceAction,
  updateAssetSymbolAction,
  apagarSplitAction,
} from "@/app/(app)/actions";
import { lerFrescura } from "@/lib/services/quotes-service";
import { getAssetTwr } from "@/lib/services/asset-twr";
import { tickerSuggestAvailable } from "@/lib/services/ticker-suggest";
import { SuggestSymbolButton } from "@/components/SuggestSymbolButton";

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
  // A frescura LÊ-SE (quem escreve é o cron e o botão «Atualizar preços») —
  // ver o comentário no PatrimonioContent.
  const freshness = await lerFrescura(ctx.space.id).catch(() => []);

  /**
   * As quatro leituras vão JUNTAS — eram quatro idas em fila indiana, nenhuma
   * a precisar da anterior. Os bens vêm pela leitura memoizada (depois da
   * atualização de preços, de propósito: traz os preços já escritos); os
   * movimentos, desdobramentos e anexos são deste ativo só, filtrados na
   * consulta.
   *
   * Sobre cada uma: os desdobramentos a `[]` quando a leitura falha é o
   * comportamento certo por uma vez (sem eles as contas ficam como antes da
   * funcionalidade existir); os anexos a `null` e nunca `[]`, porque "não
   * consegui ler" não pode dizer "não tens documentos" a quem tem lá a nota
   * de liquidação — e só entram os `pronto`.
   */
  const [assets, registados, splits, anexos] = await Promise.all([
    lerAtivos(ctx.space.id).catch(() => []),
    repo.listAssetTrades(ctx.space.id, params.id).catch(() => []),
    repo.listAssetSplits(ctx.space.id, params.id).catch(() => []),
    repo
      .listAssetAttachments(ctx.space.id, params.id)
      .then((rows) => rows.filter((a) => a.status === "pronto"))
      .catch(() => null),
  ]);
  const asset = assets.find((a) => a.id === params.id);
  if (!asset) notFound();
  const fresh = freshness.find((f) => f.assetId === asset.id);
  const quoteDate = fresh?.quoteDate ?? null;
  const quoteOriginal =
    fresh?.quoteCents !== null && fresh?.quoteCents !== undefined && fresh.quoteCurrency
      ? { cents: fresh.quoteCents, currency: fresh.quoteCurrency }
      : null;

  const today = new Date().toISOString().slice(0, 10);

  // Um desdobramento não é um negócio: é uma mudança de unidade de medida.
  // Quantidades multiplicam, preços por unidade dividem, o dinheiro não se
  // mexe. Ver `domain/splits.ts`.
  const trades = aplicarSplits(registados as Trade[], splits);

  /**
   * Pares que têm a assinatura de um desdobramento por tratar.
   *
   * Procura-se nos movimentos **como foram registados**: depois de aplicados os
   * fatores, o par já não bate certo e a deteção deixaria de o ver.
   */
  const sugeridos = detetarSplits(registados as Trade[]);

  const position = buildPosition(trades as Trade[]);
  const hasTrades = trades.length > 0;
  // Sem movimentos, a posição é a que está escrita no ativo.
  const quantity = hasTrades ? position.quantity : (asset.quantity ?? 0);
  const ret = hasTrades ? buildPositionReturn(position, asset.unitPriceCents, today) : null;

  /**
   * A outra pergunta: o investimento foi bom?
   *
   * A TIR ao lado responde a "quanto rendeu o MEU dinheiro" e move-se com o
   * timing dos reforços. Esta anula esse efeito e mede só o desempenho. Vão as
   * duas lado a lado de propósito: separadas, cada uma é meia verdade.
   */
  const twr =
    hasTrades && ret
      ? await getAssetTwr({
          symbol: asset.symbol,
          trades: trades as Trade[],
          currentValueCents: ret.currentValueCents,
          today,
        }).catch(() => null)
      : null;

  const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-PT");

  // Movimentos cujo preço por unidade destoa do resto. Ver o bloco onde são
  // mostrados: é o rasto que a importação com o separador trocado deixou.
  const implausiveis = movimentosImplausiveis(trades as Trade[], asset.unitPriceCents);

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

      {/*
        Movimentos com um preço por unidade fora de escala.
        Uma importação leu `493.975` como 493 975,00 € quando eram 493,98 €, e
        um total errado tem exactamente o mesmo aspecto de um total certo: só
        se descobre pelo absurdo, lá longe, no "investi 1,4 milhões". Fica aqui,
        ao lado do movimento, onde se corrige.
      */}
      {implausiveis.length > 0 ? (
        <div
          role="alert"
          className="space-y-2 rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-fg-muted"
        >
          <p className="font-medium text-fg">
            {implausiveis.length === 1
              ? "Há um movimento com um valor pouco plausível."
              : `Há ${implausiveis.length} movimentos com valores pouco plausíveis.`}
          </p>
          <ul className="space-y-1 text-xs leading-snug">
            {implausiveis.map((m) => (
              <li key={m.tradeId}>
                <span className="font-mono text-fg">{fmtDate(m.date)}</span>: {m.porque}
              </li>
            ))}
          </ul>
          <p className="text-xs text-fg-faint">
            Enquanto estiver assim, o investido, o ganho e a rentabilidade deste
            investimento estão errados, e arrastam o património todo com eles.
            Corrige no Editar do movimento, aqui em baixo.
          </p>
        </div>
      ) : null}

      {/*
        Desdobramentos por confirmar.

        A app reconhece a assinatura — venda e compra no mesmo dia, mesmo
        dinheiro, quantidades diferentes — mas não a aplica sozinha: a mesma
        assinatura serve a uma venda e uma recompra a sério feitas ao cêntimo, e
        transformá-la num desdobramento apagava uma mais-valia que alguém tem de
        declarar.
      */}
      {sugeridos.length > 0 ? (
        <div className="space-y-3">
          {sugeridos.map((sg) => (
            <SplitSugerido
              key={`${sg.vendaId}:${sg.compraId}`}
              assetId={asset.id}
              sugerido={sg}
            />
          ))}
        </div>
      ) : null}

      {/*
        A caixa de registar à mão fica junto dos desdobramentos, e aparece
        sempre num investimento com movimentos: a deteção precisa das duas
        pernas, e há corretoras que só exportam uma.
      */}
      {hasTrades ? <SplitManual assetId={asset.id} /> : null}

      {/* Os que já estão confirmados, e como se desfazem. */}
      {splits.length > 0 ? (
        <section className="card p-5">
          <p className="eyebrow mb-2">Desdobramentos</p>
          <ul className="space-y-1.5">
            {splits.map((sp) => (
              <li key={sp.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-fg-muted">
                  <span className="font-mono text-fg">{ratioPorExtenso(sp.ratio)}</span> em{" "}
                  {fmtDate(sp.date)}: as unidades compradas antes desta data contam
                  multiplicadas.
                </span>
                <form action={apagarSplitAction}>
                  <input type="hidden" name="id" value={sp.id} />
                  <input type="hidden" name="assetId" value={asset.id} />
                  <button type="submit" className="btn-ghost px-2 text-xs text-debt hover:text-debt">
                    Desfazer
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-fg-faint">
            O dinheiro investido não muda com isto: o que muda são as unidades e
            o custo por unidade. Os movimentos aqui em baixo continuam a mostrar
            o que a corretora registou.
          </p>
        </section>
      ) : null}

      {position.oversold ? (
        <p role="alert" className="rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-sm text-debt">
          Há vendas de mais unidades do que as que estavam registadas. Falta
          alguma compra, e enquanto faltar os números desta página não fecham.
        </p>
      ) : null}

      <section className="card p-6">
        <p className="eyebrow">Vale hoje</p>
        <p className="mt-2 font-display text-4xl font-semibold tracking-tightest tnum">
          <span className="dinheiro">{formatCents(ret ? ret.currentValueCents : Math.round(quantity * (asset.unitPriceCents ?? asset.unitCostCents ?? 0)))}</span>
        </p>
        <p className="mt-2 text-sm text-fg-muted">
          {quantity} unidades
          {position.unitCostCents !== null || asset.unitCostCents
            ? [
                ", a um custo médio de ",
                <span key="c" className="dinheiro">
                  {formatCents(position.unitCostCents ?? asset.unitCostCents ?? 0)}
                </span>,
              ]
            : ""}
          {asset.unitPriceCents
            ? [", a ", <span key="p" className="dinheiro">{formatCents(asset.unitPriceCents)}</span>]
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
                {/* O fecho na moeda da bolsa: é o número que se confere contra
                    o telemóvel. A conta é em euros, a conferência não. */}
                {quoteOriginal
                  ? `, a ${formatForeignCents(quoteOriginal.cents, quoteOriginal.currency)}`
                  : ""}
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

          {/* O campo do símbolo vive AQUI, e não só no formulário completo
              noutra página. Quem está a olhar para "sem cotação" está no sítio
              onde o quer resolver, e mandá-lo a outro ecrã era dar uma
              instrução em vez de uma caixa de texto. */}
          <form action={updateAssetSymbolAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={asset.id} />
            <div>
              <label className="label" htmlFor="simbolo">Símbolo da bolsa</label>
              <input
                key={`s:${asset.id}:${asset.symbol ?? ""}`}
                id="simbolo"
                name="symbol"
                defaultValue={asset.symbol ?? ""}
                placeholder="edp.pt"
                autoCapitalize="none"
                spellCheck={false}
                className="input w-40 font-mono"
              />
            </div>
            <button type="submit" className="btn-ghost h-11 px-3 text-xs">
              Gravar e buscar preço
            </button>
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

        <p className="mt-2 text-xs text-fg-faint">
          O sufixo diz a praça: <span className="font-mono text-fg-muted">.pt</span> Lisboa,{" "}
          <span className="font-mono text-fg-muted">.us</span> Estados Unidos,{" "}
          <span className="font-mono text-fg-muted">.de</span> Xetra,{" "}
          <span className="font-mono text-fg-muted">.uk</span> Londres,{" "}
          <span className="font-mono text-fg-muted">.fr</span> Paris,{" "}
          <span className="font-mono text-fg-muted">.nl</span> Amesterdão. Sem
          sufixo, tenta-se primeiro os Estados Unidos.
        </p>

        {!asset.symbol ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-fg-faint">
              Sem símbolo de bolsa, o preço é sempre escrito à mão, e não há
              cotação, nem ganho, nem rentabilidade.
            </p>
            {tickerSuggestAvailable() ? <SuggestSymbolButton assetId={asset.id} /> : null}
          </div>
        ) : null}
      </section>

      {ret ? (
        <section className="card p-6">
          <p className="eyebrow mb-4">O que rendeu</p>

          {/*
            Um desdobramento registado pela corretora como venda + compra no
            mesmo dia contamina MAIS do que a rentabilidade: a "venda" entra
            como saída a sério e fabrica uma mais-valia realizada que nunca
            existiu, e a "compra" entra no investido como dinheiro que nunca
            saiu do banco. Recusar só a TWR e deixar estes dois números sem
            aviso seria tapar metade do problema.
          */}
          {twr?.problem?.includes("split") ? (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-xs leading-snug text-fg-muted"
            >
              {twr.problem} Enquanto isso não estiver tratado, o{" "}
              <span className="text-fg">investido</span> e o{" "}
              <span className="text-fg">já realizado</span> aqui em baixo também
              estão inflacionados: as duas pernas do desdobramento contam como
              dinheiro que entrou e saiu, e nenhuma delas saiu do banco.
            </p>
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-xs text-fg-muted">Investido</p>
              <p className="mt-0.5 font-mono text-lg tnum text-fg">
                <span className="dinheiro">{formatCents(position.investedCents)}</span>
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
                    <span className="dinheiro">{formatCents(ret.totalGainCents)}</span>
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
              <p className="mt-0.5 text-[11px] leading-snug text-fg-faint">
                Conta com <strong className="font-normal text-fg-muted">quando</strong> meteste o
                dinheiro. Reforçar antes de uma subida melhora-a.
              </p>
            </div>

            {/*
              A segunda pergunta. Separadas, cada uma destas taxas é meia
              verdade: a TIR mistura a escolha com o timing, e esta isola a
              escolha. Lado a lado, a diferença entre as duas é exatamente o
              que o timing dos reforços valeu.
            */}
            <div>
              <p className="text-xs text-fg-muted">Desempenho do investimento (TWR)</p>
              <p
                className={`mt-0.5 font-mono text-lg tnum ${
                  !twr || twr.annualPct === null
                    ? "text-fg-faint"
                    : twr.annualPct >= 0
                      ? "text-credit"
                      : "text-debt"
                }`}
              >
                {!twr || twr.annualPct === null
                  ? "por calcular"
                  : `${twr.annualPct >= 0 ? "+" : ""}${twr.annualPct.toFixed(1).replace(".", ",")}% ao ano`}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-fg-faint">
                {twr?.problem
                  ? twr.problem
                  : twr && twr.totalPct !== null
                    ? `${twr.totalPct >= 0 ? "+" : ""}${twr.totalPct.toFixed(1).replace(".", ",")}% desde ${fmtDate(twr.since!)}, sem contar com o timing dos reforços.`
                    : "Ignora quando meteste o dinheiro: mede só o que o ativo fez."}
              </p>
            </div>
            {position.dividendsCents > 0 || position.realizedGainCents !== 0 ? (
              <div>
                <p className="text-xs text-fg-muted">Já realizado</p>
                <p className="mt-0.5 font-mono text-lg tnum text-fg">
                  <span className="dinheiro">{formatCents(position.realizedGainCents)}</span>
                  {position.dividendsCents > 0
                    ? [" (", <span key="d" className="dinheiro">{formatCents(position.dividendsCents)}</span>, " de dividendos)"]
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
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="eyebrow">Movimentos</h2>
          {asset.unitPriceCents ? (
            <p className="text-[11px] leading-snug text-fg-faint">
              O número por baixo de cada linha é o que essa entrada valeu a pena
              até hoje, ao preço de agora. Não é mais-valia realizada nem serve
              para o IRS: a posição aqui é a custo médio, e em Portugal a regra
              fiscal é FIFO.
            </p>
          ) : null}
        </div>
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
            {[...registados]
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .map((t) => (
                <TradeRow
                  key={t.id}
                  assetId={asset.id}
                  unitPriceCents={asset.unitPriceCents}
                  trade={{
                    id: t.id,
                    date: t.date,
                    kind: t.kind,
                    quantity: t.quantity ?? null,
                    amountCents: t.amountCents,
                    currency: t.currency ?? null,
                    originalAmountCents: t.originalAmountCents ?? null,
                    fxRate: t.fxRate ?? null,
                    notes: t.notes ?? null,
                  }}
                />
              ))}
          </ul>
        )}
      </section>

      <AssetAttachments
        assetId={asset.id}
        anexos={
          anexos === null
            ? null
            : anexos.map((a) => ({
                id: a.id,
                fileName: a.fileName,
                sizeBytes: a.sizeBytes,
                createdAt: a.createdAt ?? null,
              }))
        }
      />

      <TradeForm assetId={asset.id} assetName={asset.name} />
    </div>
  );
}
