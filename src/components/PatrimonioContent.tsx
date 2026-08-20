import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import { lerAtivos, lerMovimentos, lerSplits } from "@/lib/data/leituras";
import type { Asset } from "@/lib/data";
import {
  ASSET_KIND_LABELS,
  RATE_KIND_LABELS,
  annualInterestCents,
  buildLoan,
  buildNetWorth,
  buildPosition,
  movimentosImplausiveis,
  liquidoPorBem,
  aplicarSplits,
  detetarSplits,
  buildNetWorthSeries,
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
  estimatedPropertyCents,
  compararComRegistado,
  tipoDoCredito,
  type AssetKind,
  type AssetView,
  type CreditoPlano,
  type LiquidoDoBem,
  type RatePeriod,
  type RateKind,
  type Trade,
  duplicadosDeAtivos,
  datasAProximar,
  resumoDoTipo,
  type ResumoDoTipo,
  FOCOS,
  contaNoFoco,
  focoDe,
  focoValido,
  focoVazioPorExtenso,
  snapshotsDoFoco,
  type FocoId,
} from "@/lib/domain";
import { FocoPatrimonio } from "@/components/FocoPatrimonio";
import { GraficoContraIndice } from "@/components/GraficoContraIndice";
import { JanelasContraIndice } from "@/components/JanelasContraIndice";
import { FireCalculator } from "@/components/FireCalculator";
import { PlanoAviso } from "@/components/PlanoAviso";
import { AssetForm } from "@/components/AssetForm";
import { AssetAttachments, type AnexoView } from "@/components/AssetAttachments";
import {
  deleteAssetAction,
  fetchAssetQuoteAction,
  moverAtivoAction,
  updateAssetPriceAction,
} from "@/app/(app)/actions";
import { InvestmentGrid } from "@/components/InvestmentGrid";
import { RefreshQuotesButton } from "@/components/RefreshQuotesButton";
import { DescobrirMarcas } from "@/components/DescobrirMarcas";
import { AssetListSort } from "@/components/AssetListSort";
import { SuggestMissingSymbols } from "@/components/SuggestMissingSymbols";
import { AtivosDuplicados } from "@/components/AtivosDuplicados";
import { DatasAProximar } from "@/components/DatasAProximar";
import { tickerSuggestAvailable } from "@/lib/services/ia-disponivel";
import { creditContractExtractAvailable } from "@/lib/services/ia-disponivel";
import { estimarValoresDeImoveis } from "@/lib/services/imovel-service";
import {
  captureNetWorthSnapshot,
  getNetWorthHistoryCompleto,
  linhasDeIndice,
} from "@/lib/services/networth-history-service";
import { NetWorthChart } from "@/components/NetWorthChart";
import { buildPortfolioReturn } from "@/lib/services/portfolio-service";
import { lerFrescura } from "@/lib/services/quotes-service";

export type PatrimonioView = "resumo" | "ativos" | "dividas" | "fire";

/**
 * Conteúdo do património, dividido em vistas.
 *
 * São perguntas diferentes e não se leem bem à mistura: quanto tenho ao todo,
 * o que tenho, o que devo, e para onde isto vai dar.
 */
export async function PatrimonioContent({
  view,
  foco: focoBruto,
}: {
  view: PatrimonioView;
  /** O foco vindo do endereço, ainda por validar. Só o resumo o usa. */
  foco?: string;
}) {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");

  const repo = getRepository();

  /**
   * O que cada vista precisa mesmo de ler.
   *
   * **São quatro perguntas diferentes servidas pelo mesmo componente**, e até
   * aqui as quatro pagavam o custo das quatro: a vista das dívidas ia à rede
   * buscar cotações de investimentos que não mostra, e todas liam as despesas
   * todas do ambiente para calcular uma média que só o FIRE usa. Numa casa com
   * milhares de despesas, isso é a leitura mais cara da página — feita três em
   * cada quatro vezes por nada.
   */
  /**
   * **A ida à rede** é o que se salta nas dívidas: essa vista não mostra o preço
   * de investimento nenhum, e era a espera mais cara de todas.
   *
   * Os movimentos e os desdobramentos continuam a ler-se em todas as vistas, de
   * propósito. Saltá-los nas dívidas poupava uma consulta que agora já corre em
   * paralelo com as outras, e em troca fazia as quantidades de cada
   * investimento passarem a depender da vista — que é o género de subtileza que
   * um dia dá dois ecrãs a discordar sobre a mesma posição. Não vale a troca.
   */
  const precisaDeCotacoes = view !== "dividas";
  const precisaDeAnexos = view === "ativos" || view === "dividas";
  const precisaDeDespesas = view === "fire";

  // A frescura dos preços LÊ-SE, não se põe em dia aqui: quem escreve é o
  // cron (noite e manhã) e o botão «Atualizar preços». O refreshStalePrices
  // fazia fetches de câmbio e uma escrita por ativo no meio do GET — com o
  // utilizador à espera — e no pior caso somava segundos por símbolo
  // desconhecido. A página mostra o que está guardado e a data de cada fecho.
  const freshness = precisaDeCotacoes
    ? await lerFrescura(ctx.space.id).catch(() => [])
    : [];
  const quoteDateOf = new Map(freshness.map((f) => [f.assetId, f.quoteDate]));
  const quoteProblemOf = new Map(freshness.map((f) => [f.assetId, f.problem]));
  // O fecho na moeda de origem, que é o número que as pessoas reconhecem.
  const quoteOriginalOf = new Map(
    freshness
      .filter((f) => f.quoteCents !== null && f.quoteCurrency)
      .map((f) => [f.assetId, { cents: f.quoteCents!, currency: f.quoteCurrency! }]),
  );

  /**
   * As leituras independentes vão todas juntas.
   *
   * Eram cinco viagens à base de dados em fila indiana, cada uma à espera da
   * anterior sem precisar dela para nada. Nenhuma destas depende do resultado de
   * outra, por isso o tempo da página passa a ser o da mais lenta em vez da
   * soma de todas.
   *
   * A tabela dos bens pode não existir se a migração 0013 ainda não correu — daí
   * o `catch` em cada uma, e não um à volta do conjunto: uma falhar não pode
   * apagar as outras do ecrã.
   */
  const [stored, trades, splits, anexosTodos, expenses] = await Promise.all([
    // Leituras memoizadas por pedido: a comparação com os índices, atrás do
    // Suspense, volta a pedir estas três — e recebe estas respostas em vez de
    // pagar três leituras completas outra vez. (Já nada escreve preços no
    // render: quem os põe em dia é o cron e o botão.)
    lerAtivos(ctx.space.id).catch(() => [] as Asset[]),
    lerMovimentos(ctx.space.id).catch(() => []),
    lerSplits(ctx.space.id).catch(() => []),
    /**
     * Os documentos de todos os bens, numa leitura só.
     *
     * **A distinção entre "não há" e "não consegui ler" é o ponto todo.** Uma
     * leitura falhada devolvida como lista vazia diria a quem tem a escritura
     * anexada que ela desapareceu — o mesmo modo de falha que apagou o
     * património inteiro do ecrã quando a ordenação foi para o SQL antes da
     * migração. Por isso o erro vira `null` e desce assim até à linha, que o diz
     * por palavras.
     *
     * Só os `pronto`: um anexo que ficou a meio do envio não é um ficheiro. E
     * quando a vista não mostra fichas de bens, também é `null` — ninguém
     * pergunta por eles, e uma lista vazia aqui seria uma resposta a uma
     * pergunta que não foi feita.
     */
    precisaDeAnexos
      ? repo
          .listAssetAttachments(ctx.space.id)
          .then((rows) => rows.filter((x) => x.status === "pronto"))
          .catch(() => null)
      : Promise.resolve(null),
    // Só o FIRE usa isto, e é a leitura que mais cresce com o tempo.
    precisaDeDespesas
      ? repo
          .listExpenses({ spaceId: ctx.space.id, viewerId: ctx.viewerMemberId })
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  /**
   * Os desdobramentos, aplicados antes de qualquer conta.
   *
   * Tem de ser aqui e não só na ficha de cada investimento: se a ficha
   * contasse com o desdobramento e esta lista não, os dois ecrãs mostravam
   * quantidades diferentes para a mesma posição — e quem visse os dois
   * concluía, com razão, que um deles está avariado.
   *
   * O dinheiro não muda com isto. Só as unidades e o custo por unidade.
   */
  const splitsPorBem = new Map<string, typeof splits>();
  for (const sp of splits) {
    splitsPorBem.set(sp.assetId, [...(splitsPorBem.get(sp.assetId) ?? []), sp]);
  }
  const tradesByAsset = new Map<string, Trade[]>();
  for (const t of trades) {
    tradesByAsset.set(t.assetId, [...(tradesByAsset.get(t.assetId) ?? []), t as Trade]);
  }
  for (const [assetId, lista] of tradesByAsset) {
    const doBem = splitsPorBem.get(assetId);
    if (doBem && doBem.length > 0) tradesByAsset.set(assetId, aplicarSplits(lista, doBem));
  }

  const anexosPorBem = new Map<string, AnexoView[]>();
  for (const x of anexosTodos ?? []) {
    anexosPorBem.set(x.assetId, [
      ...(anexosPorBem.get(x.assetId) ?? []),
      { id: x.id, fileName: x.fileName, sizeBytes: x.sizeBytes, createdAt: x.createdAt ?? null },
    ]);
  }
  const anexosDe = (id: string): AnexoView[] | null =>
    anexosTodos === null ? null : (anexosPorBem.get(id) ?? []);
  /**
   * O valor dos imóveis segue o índice da zona desde a escritura.
   *
   * **Um valor escrito à mão ganha sempre**: quem conhece a casa sabe mais do
   * que a mediana do concelho. A conta só entra onde o campo ficou vazio — que
   * é o caso normal, porque num imóvel o valor de hoje é uma coisa que ninguém
   * tem, ao contrário do que custou.
   */
  const hoje0 = new Date().toISOString().slice(0, 10);
  const valorDeImovel = await estimarValoresDeImoveis(stored, hoje0).catch(() => new Map());

  const assets = stored.map((a) => {
    const d = derivePosition(a, tradesByAsset.get(a.id) ?? []);
    const base = d.derived ? { ...a, quantity: d.quantity, unitCostCents: d.unitCostCents } : a;
    const estimado = valorDeImovel.get(a.id);
    if (estimado && (a.valueCents ?? null) === null) {
      return { ...base, valueCents: estimado.valueCents };
    }
    return base;
  });
  const net = buildNetWorth(assets);

  /**
   * O foco do resumo: tudo, ou só uma parte do património.
   *
   * **O `net` de cima fica intocado de propósito.** É ele que vai à fotografia
   * do dia e é ele que as outras vistas usam. Gravar no histórico o líquido de
   * uma vista filtrada seria escrever no passado que naquele dia a pessoa não
   * tinha casa — e o histórico não se corrige depois, porque um saldo não se
   * reconstrói. O foco vive só no que se desenha.
   *
   * As dívidas seguem os `kinds` de cada foco: em "Investimentos" o crédito à
   * habitação não entra, porque não há ali nada que ele financie.
   */
  const foco: FocoId = view === "resumo" ? focoValido(focoBruto) : "tudo";
  const netDoFoco = (id: FocoId) =>
    id === "tudo" ? net : buildNetWorth(assets.filter((a) => contaNoFoco(a.kind, id)));
  const netFoco = netDoFoco(foco);
  const valoresPorFoco = Object.fromEntries(
    FOCOS.map((f) => [f.id, netDoFoco(f.id).netCents]),
  ) as Record<FocoId, number>;

  // Gasto anual sugerido para o FIRE: a partir das despesas reais do ambiente,
  // média dos meses com movimento, para não contar meses vazios como zero. A
  // lista vem vazia nas vistas que não são o FIRE — ver `precisaDeDespesas`.
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
  /**
   * O resumo de cada tipo, para o cabeçalho do acordeão.
   *
   * Sai da mesma vista que a lista desenha (`net.assets`), e não de uma segunda
   * contagem: dois números da mesma coisa calculados por caminhos diferentes
   * acabam sempre por discordar num dia qualquer, e quem os vir tem razão em
   * desconfiar dos dois.
   */
  const resumoDe = (kind: AssetKind) =>
    resumoDoTipo(
      kind,
      shown.map((a) => ({
        kind: a.kind,
        currentValueCents: a.currentValueCents,
        quantity: a.quantity ?? null,
        unitCostCents: a.unitCostCents ?? null,
        missingPrice: a.missingPrice,
      })),
    );
  /** O primeiro tipo com bens fica aberto. Ver o comentário no acordeão. */
  const primeiroTipo = kindsToShow.find((k) => (byKind.get(k) ?? []).length > 0) ?? null;
  // Para se poder dizer quem tem a outra parte de um bem comprado a meias. Só
  // nome e id: o campo não precisa de mais nada de ninguém.
  const memberOptions = ctx.members.map((m) => ({ id: m.id, name: m.name }));
  /**
   * Investimentos sem símbolo, separados entre os que ainda contam e os que já
   * não contam.
   *
   * Um dizia "11 sem símbolo" e a grelha por baixo mostrava dois, porque nove
   * eram posições já fechadas que a grelha esconde. Os dois números estavam
   * certos e juntos mentiam. E a distinção não é só de contagem: pôr o símbolo
   * numa posição fechada não muda rigorosamente nada — não há unidades para
   * valorizar — por isso o número que interessa é o das abertas.
   */
  const semSimboloTodos = net.assets.filter((a) => a.kind === "investimento" && !stored.find((s) => s.id === a.id)?.symbol);
  const semSimbolo = semSimboloTodos.filter((a) => (a.quantity ?? 0) > 0).length;
  const semSimboloFechados = semSimboloTodos.length - semSimbolo;
  /**
   * As gralhas dos investimentos, num sítio só.
   *
   * **Porque é que isto tem de estar aqui e não só na ficha de cada um.** Uma
   * carteira importada tem cinquenta produtos. Um movimento com o separador
   * decimal trocado inflaciona o investido de toda a gente — foi assim que o
   * chat foi anunciar "1,4 milhões investidos" — e um ativo com mais vendas do
   * que compras aparece como posição fechada, escondido pelo filtro, sem
   * ninguém perceber porque é que a NVIDIA desapareceu. Nos dois casos o dono
   * do problema tinha de o adivinhar e depois abrir cinquenta fichas para o
   * encontrar.
   */
  const tradesRegistados = new Map<string, Trade[]>();
  for (const t of trades) {
    tradesRegistados.set(t.assetId, [...(tradesRegistados.get(t.assetId) ?? []), t as Trade]);
  }
  const gralhas = stored
    .filter((a) => a.kind === "investimento")
    .map((a) => {
      const movs = (tradesByAsset.get(a.id) ?? []) as Trade[];
      if (movs.length === 0) return null;
      const posicao = buildPosition(movs);
      const implausiveis = movimentosImplausiveis(movs, a.unitPriceCents ?? null);
      // Os desdobramentos por confirmar entram na mesma lista: são a outra
      // razão por que um investimento aparece com números impossíveis, e quem
      // está a olhar para a carteira quer é a lista do que há para tratar.
      const porConfirmar = detetarSplits((tradesRegistados.get(a.id) ?? []) as Trade[]);
      if (implausiveis.length === 0 && !posicao.oversold && porConfirmar.length === 0) return null;
      return {
        id: a.id,
        nome: a.name,
        implausiveis,
        oversold: posicao.oversold,
        porConfirmar: porConfirmar.length,
      };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);

  /**
   * O líquido de cada bem que tenha crédito ligado.
   *
   * A quota já está aplicada nos dois lados — `net.assets` traz o valor com a
   * fatia deste ambiente — por isso subtrair um do outro mantém a proporção.
   * Voltar a aplicá-la aqui dava metade de metade, que é o engano que esta app
   * já cometeu uma vez com as quotas.
   */
  const liquidos = liquidoPorBem(
    net.assets
      .filter((a) => a.kind !== "divida")
      .map((a) => ({ id: a.id, name: a.name, valueCents: a.currentValueCents })),
    net.assets
      .filter((a) => a.kind === "divida")
      .map((a) => ({
        id: a.id,
        name: a.name,
        balanceCents: a.currentValueCents,
        financesAssetId: stored.find((s) => s.id === a.id)?.financesAssetId ?? null,
      })),
  );
  /** Bens que um crédito pode financiar. As dívidas não financiam dívidas. */
  const bensFinanciaveis = stored
    .filter((a) => a.kind !== "divida" && a.kind !== "investimento")
    .map((a) => ({ id: a.id, name: a.name }));

  const semMarca = stored.filter((a) => a.kind === "investimento" && !a.logoDomain).length;

  /**
   * Dois registos do mesmo investimento, vindos de importações com nomes
   * diferentes. Só pelo símbolo — parecença de nomes é um palpite sobre
   * dinheiro de alguém. Ver `domain/duplicados.ts`.
   */
  const duplicados = duplicadosDeAtivos(
    stored.filter((a) => a.kind === "investimento"),
    new Map(stored.map((a) => [a.id, (tradesByAsset.get(a.id) ?? []).length])),
  );

  /**
   * Resultados e dividendos a caminho, das posições que estão em carteira.
   *
   * Lê-se do que está gravado e nunca vai à fonte aqui: uma chamada externa por
   * investimento ao desenhar a página punha dezenas de pedidos numa função com
   * tempo limitado. Quem quiser pôr em dia carrega no botão.
   */
  const investimentosEmCarteira = stored.filter(
    (a) => a.kind === "investimento" && (a.quantity ?? 0) > 0,
  );
  const datasProximas = datasAProximar(
    investimentosEmCarteira.map((a) => ({
      id: a.id,
      name: a.name,
      symbol: a.symbol,
      emCarteira: true,
      nextEarningsDate: a.nextEarningsDate,
      exDividendDate: a.exDividendDate,
      dividendDate: a.dividendDate,
    })),
    new Date().toISOString().slice(0, 10),
  );
  const datasPorConsultar = investimentosEmCarteira.filter(
    (a) => a.symbol && !a.marketDatesAt,
  ).length;
  const podeSugerir = tickerSuggestAvailable();
  const podeLerContrato = creditContractExtractAvailable();
  const today = new Date().toISOString().slice(0, 10);
  const rates = summariseRates(assets, today);
  /**
   * Os juros seguem o foco no resumo.
   *
   * Deixá-los fora do filtro punha "Pagas 4 200 € de juros" por baixo de um
   * total de investimentos que não tem dívida nenhuma lá dentro — e a leitura
   * óbvia seria que os juros saem daquele número.
   */
  const ratesFoco =
    foco === "tudo" ? rates : summariseRates(assets.filter((a) => contaNoFoco(a.kind, foco)), today);

  /**
   * A fotografia de hoje, e o histórico para o gráfico.
   *
   * Grava-se na visita e não num cron: é idempotente (uma por dia e por
   * ambiente) e poupa mais um segredo, mais uma entrada no `vercel.json` e uma
   * lista de ambientes a percorrer. O preço são buracos nos períodos em que
   * ninguém abriu a app — que o gráfico mostra como buracos, sem os preencher.
   *
   * A gravação vem primeiro para o ponto de hoje já entrar na série. Nenhuma
   * das duas pode deitar a página abaixo: antes da migração ser corrida, a
   * tabela não existe e o gráfico diz apenas que o histórico está a começar.
   */
  // O histórico desceu para o componente `HistoricoDoPatrimonio`, atrás de um
  // Suspense: é a reconstrução mais cara do resumo e não pode ser ela a
  // segurar o património líquido e os cartões, que já estão prontos.

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
      <FocoPatrimonio atual={foco} valores={valoresPorFoco} />

      <section className="card p-6">
        <p className="eyebrow">
          {foco === "tudo" ? "Património líquido" : focoDe(foco).label}
        </p>
        <p
          className={`mt-2 font-display text-5xl font-semibold tracking-tightest tnum ${
            netFoco.netCents < 0 ? "text-debt" : ""
          }`}
        >
          <span className="dinheiro">{formatCents(netFoco.netCents)}</span>
        </p>
        {netFoco.assets.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">{focoVazioPorExtenso(foco)}</p>
        ) : (
        <p className="mt-2 text-sm text-fg-muted">
          <span className="dinheiro">{formatCents(netFoco.totalAssetsCents)}</span> em bens
          {netFoco.totalLiabilitiesCents > 0
            ? [", menos ", <span key="d" className="dinheiro">{formatCents(netFoco.totalLiabilitiesCents)}</span>, " de dívidas"]
            : ""}
          .
        </p>
        )}
        {/* Uma vista parcial tem de se anunciar. O número grande é o mesmo tipo
            de número do total, e quem chega a esta página por um link já com
            foco não tem como saber que está a ver uma parte. */}
        {foco !== "tudo" ? (
          <p className="mt-1 text-xs text-fg-faint">
            É uma parte do teu património, não o total. Ao todo tens{" "}
            <Link href="/patrimonio" className="text-fg-muted underline-offset-4 hover:underline">
              <span className="dinheiro">{formatCents(net.netCents)}</span>
            </Link>
            .
          </p>
        ) : null}

        {netFoco.investmentCostCents > 0 ? (
          <p className="mt-3 text-sm">
            Investimentos:{" "}
            <span className={netFoco.investmentGainCents >= 0 ? "text-credit" : "text-debt"}>
              {netFoco.investmentGainCents >= 0 ? "+" : ""}
              <span className="dinheiro">{formatCents(netFoco.investmentGainCents)}</span>
            </span>{" "}
            <span className="text-fg-faint">
              sobre <span className="dinheiro">{formatCents(netFoco.investmentCostCents)}</span> de custo das posições
              abertas
            </span>
          </p>
        ) : null}
        {/*
          Porque é que este número não bate com o "Investido" da página dos
          ativos, e não é engano de nenhum dos dois.

          Aqui é o CUSTO DO QUE AINDA SE TEM: quantidade vezes custo médio, das
          posições abertas. Lá é o DINHEIRO QUE JÁ ENTROU, somando todas as
          compras alguma vez feitas, incluindo as de posições que entretanto se
          venderam. São perguntas diferentes e as duas fazem falta — o que não
          se podia era chamar "investido" às duas e deixar quem lê a achar que
          um dos ecrãs está avariado.
        */}
        {netFoco.investmentCostCents > 0 ? (
          <p className="mt-1 text-xs text-fg-faint">
            É o custo do que ainda tens. Em Ativos, o &ldquo;investido&rdquo; é
            outra conta: todo o dinheiro que alguma vez entrou, incluindo o das
            posições já vendidas.
          </p>
        ) : null}
        {netFoco.investmentsMissingPrice > 0 ? (
          <p className="mt-1 text-xs text-fg-faint">
            {netFoco.investmentsMissingPrice} investimento(s) sem preço atual. Enquanto
            faltar, contam pelo que custaram e ficam de fora do ganho, para o
            número não mentir.
          </p>
        ) : null}
      </section>

      {view === "resumo" ? (
        <Suspense
          fallback={
            <div className="card h-64 animate-pulse" aria-label="A carregar o histórico…" />
          }
        >
          <HistoricoDoPatrimonio
            spaceId={ctx.space.id}
            net={net}
            today={today}
            dados={{ stored, trades, splits }}
            foco={foco}
          />
        </Suspense>
      ) : null}

      {netFoco.byKind.length > 0 ? (
        <section className="card p-5">
          <p className="eyebrow mb-3">Onde está</p>
          <ul className="space-y-3">
            {netFoco.byKind.map((k) => {
              const max = Math.max(...netFoco.byKind.map((x) => x.totalCents), 1);
              return (
                <li key={k.kind}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="text-fg">{k.label}</span>
                    <span className="font-mono tnum text-fg-muted"><span className="dinheiro">{formatCents(k.totalCents)}</span></span>
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

      {ratesFoco.annualInterestCents > 0 || ratesFoco.annualDebtInterestCents > 0 ? (
        <section className="card p-5">
          <p className="eyebrow mb-2">Juros, num ano</p>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
            {ratesFoco.annualInterestCents > 0 ? (
              <p className="text-fg-muted">
                Recebes <span className="text-credit"><span className="dinheiro">{formatCents(ratesFoco.annualInterestCents)}</span></span>
              </p>
            ) : null}
            {ratesFoco.annualDebtInterestCents > 0 ? (
              <p className="text-fg-muted">
                Pagas <span className="text-debt"><span className="dinheiro">{formatCents(ratesFoco.annualDebtInterestCents)}</span></span>
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
                <span className="dinheiro">{formatCents(rates.monthlyPaymentsCents)}</span>
              </p>
              <p className="mt-0.5 text-xs text-fg-muted">em prestações, por mês</p>
            </div>
            {rates.annualDebtInterestCents > 0 ? (
              <div>
                <p className="font-display text-2xl font-semibold tracking-tight tnum text-debt">
                  <span className="dinheiro">{formatCents(rates.annualDebtInterestCents)}</span>
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
            <span className="dinheiro">{formatCents(rates.annualInterestCents)}</span>
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
              /*
                Cada tipo abre e fecha, com o resumo no cabeçalho.

                **O resumo não é decoração.** Um cabeçalho que diga só
                "Investimentos" obriga a abrir para saber se vale a pena abrir —
                e nessa altura o acordeão só acrescentou um clique. O que se
                procura ao passar os olhos por aqui é quanto vale o grupo e se
                está a ganhar; é isso que fica à vista com ele fechado.

                O primeiro fica aberto: um ecrã todo fechado esconde que há
                alguma coisa lá dentro.
              */
              <details key={kind} open={kind === primeiroTipo} className="card group p-0">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-4">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block text-fg-faint transition-transform group-open:rotate-90"
                    >
                      ›
                    </span>
                    <span className="label mb-0">{ASSET_KIND_LABELS[kind]}</span>
                  </span>
                  <ResumoDoGrupo resumo={resumoDe(kind)} />
                </summary>

                <div className="flex flex-wrap items-start justify-between gap-2 border-t border-hair2 px-5 pt-4">
                  {/* Um botão só, para os investimentos, e só se algum tiver
                      símbolo. Com dezenas de posições ninguém carrega uma a uma. */}
                  {kind === "investimento" &&
                  stored.some((s) => s.kind === "investimento" && s.symbol) ? (
                    <RefreshQuotesButton />
                  ) : null}
                  {/* Só quando há mesmo algum por resolver: um botão que não
                      tem nada para fazer é ruído numa página cheia. */}
                  {kind === "investimento" && semMarca > 0 ? <DescobrirMarcas /> : null}
                  {/* Ordenar as listas que não são a grelha dos investimentos.
                      Com um bem só não há ordem nenhuma para escolher. */}
                  {kind !== "investimento" && (byKind.get(kind) ?? []).length > 1 ? (
                    <AssetListSort listaId={`lista-${kind}`} />
                  ) : null}
                </div>

                {/* Antes de tudo o resto: enquanto houver dois registos do
                    mesmo investimento, os números desta página estão errados,
                    e nenhum dos outros avisos vale nada em cima disso. */}
                {kind === "investimento" && duplicados.length > 0 ? (
                  <div className="border-b border-hair2 px-5 pb-4 pt-3">
                    <AtivosDuplicados grupos={duplicados} />
                  </div>
                ) : null}
                {/* As datas a caminho, logo a seguir aos duplicados: é a única
                    coisa desta página com prazo — uma data-ex que passa não
                    volta. */}
                {kind === "investimento" && investimentosEmCarteira.length > 0 ? (
                  <div className="border-b border-hair2 px-5 pb-4 pt-3">
                    <DatasAProximar datas={datasProximas} porConsultar={datasPorConsultar} />
                  </div>
                ) : null}
                {/* Depois de uma importação ficam dezenas de ativos sem símbolo,
                    e sem símbolo não há cotação, ganho nem rentabilidade. Só
                    aparece quando há mesmo algum por resolver. */}
                {kind === "investimento" && semSimbolo > 0 && podeSugerir ? (
                  <div className="border-b border-hair2 px-5 pb-4 pt-3">
                    <p className="mb-2 text-xs text-fg-faint">
                      {semSimbolo}{" "}
                      {semSimbolo === 1 ? "investimento aberto está" : "investimentos abertos estão"} sem
                      símbolo de bolsa, e por isso sem cotação, sem ganho e sem
                      rentabilidade.
                      {semSimboloFechados > 0 ? (
                        <>
                          {" "}
                          Há {semSimboloFechados === 1 ? "mais uma posição já fechada" : `mais ${semSimboloFechados} posições já fechadas`}{" "}
                          sem símbolo, mas a essas o símbolo não muda nada: não
                          há unidades para valorizar.
                        </>
                      ) : null}
                    </p>
                    <SuggestMissingSymbols />
                  </div>
                ) : null}
                {/* As gralhas, em cima e por nome. Ver `gralhas`. */}
                {kind === "investimento" && gralhas.length > 0 ? (
                  <div
                    role="alert"
                    className="space-y-2 border-b border-hair2 bg-debt/5 px-5 pb-4 pt-3"
                  >
                    <p className="text-sm font-medium text-fg">
                      {gralhas.length === 1
                        ? "Há um investimento por tratar."
                        : `Há ${gralhas.length} investimentos por tratar.`}
                    </p>
                    <p className="text-xs leading-snug text-fg-muted">
                      Enquanto isto não estiver tratado, o{" "}
                      <strong className="font-medium text-fg">investido</strong> e o{" "}
                      <strong className="font-medium text-fg">ganho</strong> desta página
                      estão errados, e um ativo com mais vendas do que compras
                      aparece como posição fechada, escondido pelo filtro de
                      cima. Foi assim que a Google e a NVIDIA desapareceram de
                      uma carteira que continuava a tê-las.
                    </p>
                    <ul className="space-y-1.5 text-xs">
                      {gralhas.map((g) => (
                        <li key={g.id}>
                          <Link
                            href={`/patrimonio/ativos/${g.id}`}
                            className="text-fg underline-offset-4 hover:underline"
                          >
                            {g.nome}
                          </Link>
                          <span className="text-fg-faint">
                            {" · "}
                            {g.porConfirmar > 0
                              ? `${g.porConfirmar === 1 ? "um desdobramento" : `${g.porConfirmar} desdobramentos`} por confirmar`
                              : null}
                            {g.porConfirmar > 0 && (g.oversold || g.implausiveis.length > 0) ? "; " : null}
                            {g.oversold ? "mais vendas do que compras" : null}
                            {g.oversold && g.implausiveis.length > 0 ? "; " : null}
                            {g.implausiveis.map((m, i) => (
                              <span key={m.date + i}>
                                {i > 0 ? "; " : null}
                                {new Date(`${m.date}T00:00:00Z`).toLocaleDateString("pt-PT")}:{" "}
                                <span className="dinheiro">{formatCents(m.implicitoCents)}</span>
                                /un., {Math.round(m.vezes >= 1 ? m.vezes : 1 / m.vezes)}×{" "}
                                {m.vezes >= 1 ? "acima" : "abaixo"} do normal
                              </span>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
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
                  <InvestmentGrid
                    items={(byKind.get(kind) ?? []).map((a) => ({
                      id: a.id,
                      name: a.name,
                      // O símbolo vive no ativo gravado, não na vista
                      // calculada — e é dele que sai a cor do emblema.
                      symbol: stored.find((x) => x.id === a.id)?.symbol ?? null,
                      exchange: stored.find((x) => x.id === a.id)?.exchange ?? null,
                      temLogo: Boolean(stored.find((x) => x.id === a.id)?.logoDomain),
                      quantity: a.quantity ?? 0,
                      unitCostCents: a.unitCostCents ?? null,
                      unitPriceCents: a.unitPriceCents ?? null,
                      currentValueCents: a.currentValueCents,
                      gainCents: a.missingPrice ? null : a.gainCents,
                      gainPct: a.missingPrice ? null : a.gainPct,
                      tradeCount: (tradesByAsset.get(a.id) ?? []).length,
                      quoteDate: quoteDateOf.get(a.id) ?? null,
                      // Sem isto, o motivo era calculado e deitado fora: o
                      // bloco que o mostrava vivia no AssetRow, que nunca é
                      // desenhado para investimentos.
                      quoteProblem: quoteProblemOf.get(a.id) ?? null,
                    }))}
                  />
                ) : (
                  <ul id={`lista-${kind}`} className="divide-y divide-hair2">
                    {(byKind.get(kind) ?? []).map((a, i, lista) => (
                      <AssetRow
                        key={a.id}
                        primeiro={i === 0}
                        ultimo={i === lista.length - 1}
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
                        podeLerContrato={podeLerContrato}
                        anexos={anexosDe(a.id)}
                        liquido={liquidos.get(a.id) ?? null}
                        bensFinanciaveis={bensFinanciaveis}
                      />
                    ))}
                  </ul>
                )}
              </details>
            ))
        )}
      </section>
      ) : null}

      {view === "ativos" ? (
        // Atrás de um Suspense, de propósito: é o trabalho mais caro da app
        // (dois benchmarks, sete janelas, série mensal) e a lista de ativos já
        // está pronta — aparece primeiro, e a comparação flui quando chegar.
        <Suspense
          fallback={
            <div className="card h-48 animate-pulse" aria-label="A comparar com os índices…" />
          }
        >
          <PortfolioReturnSection spaceId={ctx.space.id} contaminado={gralhas.length > 0} />
        </Suspense>
      ) : null}

      {view === "ativos" || view === "dividas" ? (
        <AssetForm
          contexto={view === "dividas" ? "dividas" : "ativos"}
          members={memberOptions}
          podeLerContrato={podeLerContrato}
          bensFinanciaveis={bensFinanciaveis}
        />
      ) : null}

      <Link href="/relatorios" className="inline-block text-sm text-fg-muted hover:text-fg">
        Ver relatórios de despesa
      </Link>
    </div>
  );
}

/**
 * O gráfico do histórico do património, num componente próprio para poder
 * fluir atrás de um Suspense.
 *
 * A fotografia grava-se na visita e não num cron: é idempotente (uma por dia
 * e por ambiente). Os bens e os movimentos vêm de cima, já lidos — passá-los
 * evita duas leituras completas repetidas em cada abertura do resumo.
 */
async function HistoricoDoPatrimonio({
  spaceId,
  net,
  today,
  dados,
  foco,
}: {
  spaceId: string;
  net: Parameters<typeof captureNetWorthSnapshot>[1];
  today: string;
  dados: NonNullable<Parameters<typeof getNetWorthHistoryCompleto>[2]>;
  foco: Parameters<typeof snapshotsDoFoco>[1];
}) {
  // A fotografia gravada é sempre a do património INTEIRO. Ver `foco`.
  const captura = await captureNetWorthSnapshot(spaceId, net, today);
  const completo = await getNetWorthHistoryCompleto(spaceId, today, dados);
  /**
   * O gráfico segue o foco, e os pontos que não sabem repartir-se saem.
   *
   * As fotografias antigas — e todas as reconstruídas — só guardaram o total.
   * Reparti-lo pelas proporções de hoje desenhava uma linha de investimentos
   * que nunca existiu. Contam-se e dizem-se por baixo.
   */
  const { snapshots: doFoco, semReparticao } = snapshotsDoFoco(completo, foco);
  const series = buildNetWorthSeries(doFoco);
  /**
   * Os índices são calculados sobre os PONTOS DA SÉRIE, não sobre os
   * snapshots em bruto: a série agrupa por mês, os snapshots são um por dia,
   * e o gráfico desenha cada valor pela sua posição. São contexto e nunca
   * podem custar a página: se a fonte de cotações não responder, o gráfico
   * desenha-se na mesma.
   */
  const indices = await linhasDeIndice(series.points).catch(() => []);

  return (
    <div className="space-y-2">
      <NetWorthChart series={series} captura={captura} indices={indices} />
      {/* O buraco explicado. Sem isto, escolher "Investimentos" fazia o
          gráfico encolher para dois pontos sem razão à vista — e um gráfico
          que encolhe sozinho lê-se como avaria. */}
      {semReparticao > 0 ? (
        <p className="text-xs text-fg-faint">
          {semReparticao === 1
            ? "Há uma fotografia mais antiga que"
            : `Há ${semReparticao} fotografias mais antigas que`}{" "}
          só guardou o total, sem o repartir por tipo de bem, por isso{" "}
          {semReparticao === 1 ? "fica" : "ficam"} de fora deste gráfico. A
          repartição passou a ser guardada e daqui para a frente a linha
          enche-se sozinha.
        </p>
      ) : null}
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
async function PortfolioReturnSection({
  spaceId,
  contaminado,
}: {
  spaceId: string;
  /** Há movimentos com valores impossíveis na carteira? Ver em baixo. */
  contaminado: boolean;
}) {
  const ret = await buildPortfolioReturn(spaceId).catch(() => null);
  if (!ret) return null;

  return (
    <section className="card p-6">
      <p className="eyebrow mb-4">Rentabilidade da carteira</p>

      {/*
        A recusa, e não um aviso ao lado dos números.

        Com um movimento com o separador decimal trocado, esta secção mostrava
        950 432 € investidos, 270 843 € de valor e uma TIR de +13,3% — três
        números que se contradizem, e o único que salta à vista é o verde. Uma
        taxa é a coisa mais fácil de acreditar de toda esta página: não se
        confere contra nada, e uma pessoa lembra-se dela muito depois de ter
        esquecido de onde veio.

        A comparação com o índice cai pela mesma razão: aplica ao índice os
        MESMOS reforços, e se os reforços estão inflacionados o "estás atrás
        183 293 €" é uma dívida imaginária.
      */}
      {contaminado ? (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-debt/30 bg-debt/10 px-4 py-3 text-xs leading-snug text-fg-muted"
        >
          <p className="text-fg">
            Não mostro a rentabilidade enquanto houver movimentos com valores
            impossíveis.
          </p>
          <p className="mt-1">
            Estão listados aqui em baixo, nos investimentos. Um deles chega para
            inflacionar o investido, e daí sai uma taxa que se contradiz com os
            números ao lado, mas que ninguém confere, porque uma percentagem
            não se confere contra nada.
          </p>
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-fg-muted">Dinheiro que entrou</p>
          <p
            className={`mt-0.5 font-mono text-lg tnum ${contaminado ? "text-fg-faint line-through" : "text-fg"}`}
            title={contaminado ? "Inflacionado por movimentos com valores impossíveis." : undefined}
          >
            <span className="dinheiro">{formatCents(ret.investedCents)}</span>
          </p>
          {/* Ver a nota no resumo: aqui soma-se TODAS as compras, incluindo as
              de posições já vendidas. No resumo é o custo do que ainda se tem.
              Chamar "investido" às duas fazia o resumo e esta página parecerem
              contradizer-se. */}
          <p className="mt-0.5 text-[11px] leading-snug text-fg-faint">
            Todas as compras, incluindo as de posições já vendidas.
          </p>
        </div>
        <div>
          <p className="text-xs text-fg-muted">Vale hoje</p>
          <p className="mt-0.5 font-mono text-lg tnum text-fg">
            <span className="dinheiro">{formatCents(ret.currentValueCents)}</span>
          </p>
          {/*
            O que já se vendeu não está aqui, e tinha de ser dito.

            O "dinheiro que entrou" inclui as compras das posições já vendidas;
            o "vale hoje" não inclui nada do que elas devolveram. Sem esta
            linha, o ganho aparente ficava mais pequeno do que o real por todo o
            dinheiro que passou por posições fechadas — e um resultado já
            realizado é tão real como o que ainda está em carteira. Mais: já
            está garantido.
          */}
          {ret.proceedsCents > 0 ? (
            <p className="mt-0.5 text-[11px] leading-snug text-fg-faint">
              Mais <span className="dinheiro">{formatCents(ret.proceedsCents)}</span> que já saíram em vendas, com{" "}
              <span className={ret.realizedGainCents >= 0 ? "text-credit" : "text-debt"}>
                {ret.realizedGainCents >= 0 ? "+" : ""}
                <span className="dinheiro">{formatCents(ret.realizedGainCents)}</span>
              </span>{" "}
              de resultado já garantido.
            </p>
          ) : null}
        </div>
        <div>
          <p className="text-xs text-fg-muted">Taxa anual (TIR)</p>
          <p
            className={`mt-0.5 font-mono text-lg tnum ${
              ret.annualPct === null ? "text-fg-faint" : ret.annualPct >= 0 ? "text-credit" : "text-debt"
            }`}
          >
            {contaminado || ret.annualPct === null
              ? "por calcular"
              : `${ret.annualPct >= 0 ? "+" : ""}${ret.annualPct.toFixed(1).replace(".", ",")}%`}
          </p>
        </div>
      </div>

      {ret.missingPrice > 0 ? (
        <div className="mt-3 text-xs text-fg-faint">
          <p>
            {ret.missingPrice === 1
              ? "Um investimento ainda em carteira está sem preço atual: conta"
              : `${ret.missingPrice} investimentos ainda em carteira estão sem preço atual: contam`}{" "}
            pelo que custaram, por isso o valor de hoje está por baixo do real.
          </p>
          {/* Quais são, com link. A contagem sozinha era um beco: numa carteira
              de cinquenta, "8 sem preço" não diz por onde começar. */}
          <p className="mt-1">
            {ret.semPreco.map((a, i) => (
              <span key={a.id}>
                {i > 0 ? ", " : ""}
                <Link
                  href={`/patrimonio/ativos/${a.id}`}
                  className="text-fg-muted underline-offset-4 hover:text-fg hover:underline"
                >
                  {a.name}
                </Link>
              </span>
            ))}
            .
          </p>
        </div>
      ) : null}

      {/* A comparação com o índice desaparece inteira quando os reforços estão
          inflacionados: ela aplica ao índice os MESMOS reforços, e "estás atrás
          183 293 €" a partir de dinheiro que nunca entrou é uma dívida
          imaginária — pior do que não comparar. */}
      <div className={`mt-6 border-t border-hair pt-5 ${contaminado ? "hidden" : ""}`}>
        <p className="label mb-1">E se tivesse ido para o índice?</p>
        <p className="mb-2 text-xs text-fg-faint">
          Os mesmos reforços, nas mesmas datas, aplicados a um ETF em euros. É a
          única comparação justa: um índice não recebe reforços, e comparar a
          subida dele com a tua trata todo o teu dinheiro como se tivesse
          entrado no primeiro dia.
        </p>
        {/*
          Sobre que parte da carteira é que isto fala.

          Um investimento sem preço atual conta pelo que custou. Se o dinheiro
          dele comprasse unidades do índice na mesma, o índice valorizava-o e a
          carteira mantinha-o congelado — nascia um desnível que não veio do
          mercado, veio de faltar uma cotação. Ficam de fora dos dois lados, e
          isso tem de ser dito: senão a comparação de uma parte lê-se como a
          comparação de tudo.
        */}
        {ret.foraDaComparacaoCents > 0 ? (
          <p className="mb-4 text-xs leading-snug text-fg-faint">
            Ficam de fora <span className="dinheiro">{formatCents(ret.foraDaComparacaoCents)}</span> de{" "}
            {ret.missingPrice === 1
              ? "um investimento sem preço atual"
              : `${ret.missingPrice} investimentos sem preço atual`}
            . Sem cotação não dá para os comparar com nada, e contá-los só de um
            lado inventava um desnível que o mercado não fez. A taxa anual acima
            segue a mesma regra.
          </p>
        ) : null}

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
                    <span className="dinheiro">{formatCents(b.comparison.differenceCents)}</span>
                  </p>
                ) : null}
              </div>
              {b.comparison ? (
                <p className="mt-0.5 text-xs text-fg-muted">
                  No índice terias{" "}
                  <span className="tnum text-fg">
                    <span className="dinheiro">{formatCents(b.comparison.benchmarkValueCents)}</span>
                  </span>
                  , tens{" "}
                  <span className="tnum text-fg">
                    <span className="dinheiro">{formatCents(b.comparison.portfolioValueCents)}</span>
                  </span>
                  .{" "}
                  {b.comparison.differenceCents >= 0
                    ? "Estás à frente."
                    : "Estás atrás."}
                  {/*
                    Sem esta frase, os dois valores contradizem o "Vale hoje"
                    logo acima e não há nada a explicar a diferença. Ambos
                    contam o dinheiro que já saiu para a conta, porque o índice
                    levou com as mesmas saídas nas mesmas datas — e sem isso o
                    valor dele chega a sair negativo em quem vendeu com lucro.
                  */}
                  {b.comparison.withdrawnCents > 0 ? (
                    <>
                      {" "}
                      Os dois incluem os{" "}
                      <span className="tnum">
                        <span className="dinheiro">{formatCents(b.comparison.withdrawnCents)}</span>
                      </span>{" "}
                      que já voltaram de vendas e dividendos.
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-fg-faint">{b.problem}</p>
              )}
              {/* O caminho, por baixo do número. Ver `GraficoContraIndice`. */}
              {b.comparison && b.serie.length >= 2 ? (
                <GraficoContraIndice pontos={b.serie} label={b.label} />
              ) : null}
              {/* "Valeu a pena?" está acima; isto responde a "e agora?". */}
              <JanelasContraIndice janelas={b.janelas} label={b.label} />
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

/**
 * Os números de um grupo, no cabeçalho do acordeão.
 *
 * Mostra só o que existe: onde não há custo registado não há "investido" nem
 * percentagem, e um zero ali lia-se como "não ganhaste nada" quando o que se
 * passa é que a pergunta não se aplica àquele tipo de bem.
 */
function ResumoDoGrupo({ resumo }: { resumo: ResumoDoTipo }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-[11px] tnum text-fg-faint">
      <span>
        {resumo.quantos} {resumo.quantos === 1 ? "bem" : "bens"}
      </span>
      <span className="text-fg-muted"><span className="dinheiro">{formatCents(resumo.valorCents)}</span></span>
      {resumo.custoCents !== null ? (
        <span><span className="dinheiro">{formatCents(resumo.custoCents)}</span> investido</span>
      ) : null}
      {resumo.ganhoPct !== null ? (
        <span className={resumo.ganhoCents! >= 0 ? "text-credit" : "text-debt"}>
          {resumo.ganhoCents! >= 0 ? "+" : ""}
          {String(resumo.ganhoPct).replace(".", ",")}%
        </span>
      ) : null}
      {/* Quantos ficaram de fora do ganho. Sem isto, a percentagem parecia
          cobrir a carteira toda quando cobre só parte dela. */}
      {resumo.semPreco > 0 ? (
        <span title="Sem preço atual: contam pelo que custaram e ficam de fora do ganho.">
          {resumo.semPreco} sem preço
        </span>
      ) : null}
    </span>
  );
}

/** "2054-05" lido como se fala. */
function formatMonthYear(ym: string | null): string {
  if (!ym) return "-";
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
        Crédito de taxa {tipoDoCredito(periodos) ?? "-"}, sem plano:{" "}
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
        <span className="tnum text-fg"><span className="dinheiro">{formatCents(atual.monthlyPaymentCents)}</span></span> por mês
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
          <span className="tnum"><span className="dinheiro">{formatCents(plano.nextPaymentCents)}</span></span> por mês,{" "}
          {sobe ? "mais" : "menos"}{" "}
          <span className="tnum">
            <span className="dinheiro">{formatCents(Math.abs(plano.nextPaymentCents - atual.monthlyPaymentCents))}</span>
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
            <span className="tnum text-debt"><span className="dinheiro">{formatCents(plano.totalInterestCents)}</span></span> de
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
  podeLerContrato,
  primeiro,
  ultimo,
  anexos,
  liquido,
  bensFinanciaveis,
}: {
  asset: AssetView;
  stored: Asset | null;
  members: { id: string; name: string }[];
  /** `null` quer dizer "não consegui ler", nunca "não há nenhum". */
  anexos: AnexoView[] | null;
  /** O líquido deste bem, quando tem crédito ligado. */
  liquido: LiquidoDoBem | null;
  bensFinanciaveis: { id: string; name: string }[];
  /** Há leitura de contratos configurada? */
  podeLerContrato: boolean;
  /** Para desligar os botões de mover nas pontas da lista. */
  primeiro: boolean;
  ultimo: boolean;
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
  /**
   * O imóvel ao preço da zona, quando há área e preço de referência.
   *
   * Aparece **ao lado** do valor registado e nunca por cima: a mediana do
   * concelho não sabe se a casa é num último andar com vista ou num rés do chão
   * para as traseiras. Compara-se com o valor TOTAL, não com a fatia deste
   * ambiente — a quota aplica-se igual aos dois lados e não muda a percentagem.
   */
  const zonaCents = estimatedPropertyCents({
    areaM2: stored?.areaM2,
    priceRefCents: stored?.priceRefCents,
  });
  const zona = compararComRegistado(zonaCents, assetTotalValueCents(a));

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
    /* Os `data-*` são o que permite ordenar no cliente sem voltar ao servidor:
       os valores já estão no HTML, e o seletor só troca os filhos de sítio. A
       taxa fica em branco quando não há, para não ser lida como zero. */
    <li
      className="px-5 py-3.5"
      data-nome={a.name}
      data-valor={a.currentValueCents}
      data-taxa={a.interestRatePct ?? ""}
    >
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
              {/* Com os valores tapados, as unidades saem e fica só por quanto
                  se comprou: o preço por unidade não diz quanto lá está. */}
              <span className="so-aberto">{a.quantity} un. a </span>
              <span className="so-privado">comprado a </span>
              <span className="preco-un">{formatCents(a.unitCostCents ?? 0)}</span>
              {a.unitPriceCents !== null && a.unitPriceCents !== undefined
                ? [", a ", <span key="p" className="preco-un">{formatCents(a.unitPriceCents)}</span>]
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
            <>
              {a.purchasedAt ?? ""}
              {stored?.location ? `${a.purchasedAt ? " · " : ""}${stored.location}` : ""}
            </>
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
          <p className="font-mono text-sm tnum text-fg"><span className="dinheiro">{formatCents(a.currentValueCents)}</span></p>
          {/* Com quota parcial, o número acima é só a tua parte. Dizer de quanto
              é que ele é parte evita a pergunta "porque é que isto está a
              menos?" — e evita a resposta errada, que seria alguém corrigir o
              valor para o dobro e passar a contar a casa toda. */}
          {quota < 1 ? (
            <p className="font-mono text-[11px] tnum text-fg-faint">
              {quotaLabel} de <span className="dinheiro">{formatCents(assetTotalValueCents(a))}</span>
            </p>
          ) : null}
          {/* A estimativa da zona, com a diferença em percentagem: é a diferença
              que faz alguém ir ver o valor, não o valor absoluto. Fica apagada
              e identificada — é uma referência, não uma avaliação. */}
          {/* Na mesma base que o número de cima: com quota parcial, aquele é a
              tua parte, e pôr aqui o valor inteiro da casa ao lado dele fazia
              parecer que a estimativa era o dobro do que é. A percentagem não
              muda com a quota — divide-se dos dois lados. */}
          {zonaCents !== null ? (
            <p className="font-mono text-[11px] tnum text-fg-faint">
              zona: <span className="dinheiro">{formatCents(Math.round(zonaCents * quota))}</span>
              {zona ? ` (${zona.ratio >= 1 ? "+" : ""}${Math.round((zona.ratio - 1) * 100)}%)` : ""}
            </p>
          ) : null}
          {a.gainCents !== null ? (
            <p className={`font-mono text-[11px] tnum ${a.gainCents >= 0 ? "text-credit" : "text-debt"}`}>
              {a.gainCents >= 0 ? "+" : ""}
              <span className="dinheiro">{formatCents(a.gainCents)}</span>
              {a.gainPct !== null ? ` (${a.gainPct >= 0 ? "+" : ""}${Math.round(a.gainPct)}%)` : ""}
            </p>
          ) : null}
        </div>

        {/* Arrumar a lista pela ordem de quem olha para ela. A de criação, numa
            carteira importada, é a ordem do ficheiro da corretora. */}
        <div className="flex items-center">
          <form action={moverAtivoAction}>
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="dir" value="cima" />
            <button
              type="submit"
              disabled={primeiro}
              aria-label={`Mover ${a.name} para cima`}
              className="btn-ghost px-1.5 text-xs disabled:opacity-25"
            >
              ↑
            </button>
          </form>
          <form action={moverAtivoAction}>
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="dir" value="baixo" />
            <button
              type="submit"
              disabled={ultimo}
              aria-label={`Mover ${a.name} para baixo`}
              className="btn-ghost px-1.5 text-xs disabled:opacity-25"
            >
              ↓
            </button>
          </form>
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
              A prestação de <span className="dinheiro">{formatCents(plan.monthlyPaymentCents ?? 0)}</span> não chega para os{" "}
              <span className="dinheiro">{formatCents(plan.nextInterestCents ?? 0)}</span> de juro do mês: assim a dívida cresce.
            </>
          ) : (
            <>
              A prestação de <span className="dinheiro">{formatCents(plan.monthlyPaymentCents ?? 0)}</span> cobre os{" "}
              <span className="dinheiro">{formatCents(plan.nextInterestCents ?? 0)}</span> de juro por pouco e só abate{" "}
              <span className="dinheiro">{formatCents(plan.nextPrincipalCents ?? 0)}</span> por mês: a este ritmo não salda em
              cem anos.
            </>
          )}
        </p>
      ) : null}

      {plan && plan.monthsToPayOff !== null ? (
        <div className="mt-2 space-y-0.5 text-xs text-fg-muted">
          <p>
            <span className="tnum text-fg"><span className="dinheiro">{formatCents(plan.monthlyPaymentCents ?? 0)}</span></span> por
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
                <span className="tnum text-debt"><span className="dinheiro">{formatCents(plan.totalInterestCents)}</span></span> de
                juros até lá
              </>
            ) : null}
            .
          </p>
          {plan.nextInterestCents ? (
            <p className="text-fg-faint">
              Da próxima prestação, <span className="dinheiro">{formatCents(plan.nextInterestCents)}</span> é juro e{" "}
              <span className="dinheiro">{formatCents(plan.nextPrincipalCents ?? 0)}</span> abate mesmo à dívida.
            </p>
          ) : null}
        </div>
      ) : null}

      {yearlyInterest > 0 ? (
        <p className="mt-2 text-xs text-fg-muted">
          <span className="tnum">{String(a.interestRatePct).replace(".", ",")}%</span> ao ano
          {rateLabel ? `, ${rateLabel}` : ""}: rende cerca de{" "}
          <span className="tnum text-credit"><span className="dinheiro">{formatCents(yearlyInterest)}</span></span> por ano.
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

      {/*
        O líquido: o que o bem vale menos o que falta pagar dele.
        A pergunta que toda a gente faz sobre a sua casa, e que só existia
        diluída no total do património.
      */}
      {liquido ? (
        <p className="mt-2 text-xs text-fg-muted">
          Líquido:{" "}
          <span
            className={`font-mono tnum ${liquido.liquidoCents >= 0 ? "text-credit" : "text-debt"}`}
          >
            <span className="dinheiro">{formatCents(liquido.liquidoCents)}</span>
          </span>{" "}
          <span className="text-fg-faint">
            (falta pagar <span className="dinheiro">{formatCents(liquido.dividaCents)}</span> em{" "}
            {liquido.creditos.map((c) => c.name).join(", ")}
            {liquido.pagoPct !== null ? `. ${liquido.pagoPct}% já é teu` : ""}
            {liquido.liquidoCents < 0
              ? ". Deves mais do que ele vale, o que é normal nos primeiros anos"
              : ""}
            ).
          </span>
        </p>
      ) : null}

      {a.notes ? <p className="mt-2 text-xs text-fg-faint">{a.notes}</p> : null}

      {/*
        Os documentos, fechados por omissão.
        A escritura de um imóvel e o contrato de um crédito são exatamente os
        papéis que se procuram uma vez por ano e nunca se sabe onde estão. Ficam
        aqui, ao lado do registo a que pertencem, mas dobrados: uma lista de
        bens não é sítio para mostrar ficheiros de todos ao mesmo tempo.
      */}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-fg-faint transition-colors hover:text-fg">
          Documentos
          {anexos && anexos.length > 0 ? ` (${anexos.length})` : ""}
        </summary>
        <div className="mt-3">
          <AssetAttachments assetId={a.id} anexos={anexos} />
        </div>
      </details>

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
            podeLerContrato={podeLerContrato}
            bensFinanciaveis={bensFinanciaveis}
            asset={{
              id: a.id,
              name: a.name,
              kind: a.kind,
              quantity: stored?.quantity ?? a.quantity,
              unitCostCents: stored?.unitCostCents ?? a.unitCostCents,
              unitPriceCents: a.unitPriceCents,
              valueCents: a.valueCents,
              purchasedAt: a.purchasedAt,
              areaM2: stored?.areaM2 ?? null,
              location: stored?.location ?? null,
              priceRefCents: stored?.priceRefCents ?? null,
              priceRefSource: stored?.priceRefSource ?? null,
              priceRefGeocod: stored?.priceRefGeocod ?? null,
              purchasePriceCents: stored?.purchasePriceCents ?? null,
              worksCents: stored?.worksCents ?? null,
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
              financesAssetId: stored?.financesAssetId ?? null,
            }}
          />
        </div>
      </details>
    </li>
  );
}
