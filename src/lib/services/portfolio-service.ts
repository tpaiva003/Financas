/**
 * Rentabilidade da carteira, e a comparação honesta com um índice.
 *
 * A pergunta "bati o S&P 500?" quase sempre é respondida mal. Vê-se a subida do
 * índice no ano, vê-se a subida da carteira, comparam-se as duas. Isso só
 * estaria certo se todo o dinheiro tivesse entrado no primeiro dia do ano, e
 * numa carteira que recebe reforços nunca é o caso: os 20% do índice nunca
 * estiveram disponíveis para o dinheiro que entrou em novembro.
 *
 * O que se faz aqui é aplicar ao índice **os mesmos reforços, nas mesmas
 * datas**, com a cotação de cada uma dessas datas, e comparar os dois valores
 * finais em euros. Essa comparação é justa, e é a única que responde à pergunta
 * que interessa de facto: "e se eu tivesse metido isto no índice?".
 */

import { getRepository } from "@/lib/data";
import {
  BENCHMARKS,
  buildPosition,
  normalizeSymbol,
  quotesToPrices,
  precoNoDia,
  serieDaComparacao,
  simulateBenchmark,
  xirr,
  type BenchmarkComparison,
  type CashFlow,
  type PontoDaComparacao,
  type Trade,
} from "@/lib/domain";
import { getQuoteSeries } from "./quotes-service";

export interface BenchmarkResult {
  id: string;
  label: string;
  description: string;
  comparison: BenchmarkComparison | null;
  /**
   * A mesma comparação mês a mês, para se ver o caminho e não só o fim.
   *
   * "Estás atrás 8 832 €" não diz se o desnível está a abrir ou a fechar, e são
   * conclusões opostas: de −20 mil para −8 mil é recuperar; de zero para −8 mil
   * é perder terreno. O mesmo número.
   */
  serie: PontoDaComparacao[];
  /** Porque é que não deu, quando não dá. */
  problem: string | null;
  /** Data da cotação mais recente usada. */
  lastDate: string | null;
  /** Que símbolo é que acabou por servir, dos que se tentaram. */
  symbol: string | null;
  /**
   * Em que moeda esse símbolo cota.
   *
   * Quando não é euro, a comparação passa a incluir o câmbio, e a página tem de
   * o dizer: senão uma diferença que vem do dólar lê-se como se viesse do
   * mercado.
   */
  currency: "EUR" | "USD" | null;
}

export interface PortfolioReturn {
  /** Soma das entradas de dinheiro. */
  investedCents: number;
  /** O que a carteira vale hoje. */
  currentValueCents: number;
  gainCents: number;
  /**
   * TIR anualizada **do que está valorizado**, não da carteira toda.
   *
   * As posições sem preço atual ficam de fora dela e da comparação com o
   * índice, pela mesma razão: contá-las de um lado e não do outro fabrica um
   * resultado. Ver `foraDaComparacaoCents`.
   */
  annualPct: number | null;
  /** Data do primeiro movimento. */
  firstDate: string | null;
  /** Investimentos sem preço atual: o valor de hoje está incompleto. */
  missingPrice: number;
  /**
   * Quais são, com nome e id.
   *
   * A contagem sozinha era um beco: "8 investimentos sem preço atual" e nenhuma
   * forma de saber quais, numa carteira de cinquenta. Quem lê isto quer
   * resolvê-lo, e para isso precisa de lá chegar.
   */
  semPreco: { id: string; name: string }[];
  /**
   * Dinheiro que ficou de fora da comparação e da taxa, por falta de cotação.
   *
   * Existe para o ecrã poder dizer sobre que parte da carteira é que o "estás
   * atrás" fala. Sem isto, uma comparação de metade do dinheiro lia-se como uma
   * comparação de tudo.
   */
  foraDaComparacaoCents: number;
  benchmarks: BenchmarkResult[];
}

/**
 * A rentabilidade da carteira inteira de um ambiente.
 *
 * Devolve `null` quando não há movimentos datados: sem datas não há nada disto
 * para calcular, e mostrar uma comparação a zeros seria pior do que não mostrar
 * nada.
 */
export async function buildPortfolioReturn(spaceId: string): Promise<PortfolioReturn | null> {
  const repo = getRepository();
  const [assets, trades] = await Promise.all([
    repo.listAssets(spaceId).catch(() => []),
    repo.listAssetTrades(spaceId).catch(() => []),
  ]);

  const investments = assets.filter((a) => a.kind === "investimento");
  if (investments.length === 0 || trades.length === 0) return null;

  /**
   * As cotações de todos os investimentos, numa consulta só.
   *
   * Servem para saber o que a carteira valia em cada mês do passado — sem elas
   * só se sabe o valor de hoje, e um número sozinho não diz se o desnível
   * contra o índice está a abrir ou a fechar.
   */
  const cotacoesPorSimbolo = await repo
    .listQuotesFor(
      investments
        .filter((a) => a.symbol)
        .map((a) => normalizeSymbol(String(a.symbol)))
        .filter((x): x is string => Boolean(x)),
    )
    .catch(() => new Map<string, { date: string; closeCents: number }[]>());

  const byAsset = new Map<string, Trade[]>();
  for (const t of trades) {
    byAsset.set(t.assetId, [...(byAsset.get(t.assetId) ?? []), t as Trade]);
  }

  /**
   * Os fluxos da comparação e os da carteira **não são os mesmos**, e essa é a
   * correção que este bloco existe para fazer.
   *
   * O `investedCents` e o `currentValueCents` descrevem a carteira toda, que é
   * o que a pessoa quer ver em cima. Os `flows` alimentam o índice — e para
   * isso só podem levar o dinheiro que também está valorizado do lado de cá.
   *
   * **Um investimento sem preço atual conta pelo que custou.** Se o dinheiro
   * dele comprasse unidades do índice na mesma, o índice valorizava-o e a
   * carteira mantinha-o congelado ao custo: nasce um desnível que não veio do
   * mercado nenhum, veio de faltar uma cotação. Com oito posições assim numa
   * carteira, esse desnível fabricado pode ser o desnível todo — e o ecrã
   * mostrava-o com um sinal vermelho e uma frase categórica.
   *
   * Então entram nas duas contas ou em nenhuma. O que fica de fora é contado e
   * dito, para o "estás atrás" não passar por uma leitura da carteira inteira
   * quando é de uma parte dela.
   */
  const flows: CashFlow[] = [];
  let investedCents = 0;
  let currentValueCents = 0;
  let missingPrice = 0;
  const semPreco: { id: string; name: string }[] = [];
  let firstDate: string | null = null;
  /** O valor de hoje só do que é comparável. É este que vai ao índice. */
  let valorComparavelCents = 0;
  /** E o dinheiro que ficou de fora da comparação, para o ecrã o dizer. */
  let foraDaComparacaoCents = 0;
  /** Os bens que entram na comparação, para reconstruir a carteira no tempo. */
  const comparaveis: { bem: (typeof investments)[number]; movimentos: Trade[] }[] = [];

  for (const a of investments) {
    const own = byAsset.get(a.id) ?? [];
    if (own.length === 0) {
      // Posição escrita à mão, sem movimentos: entra no valor de hoje mas não
      // tem datas para entrar na comparação. Contá-la de um lado e não do
      // outro daria uma comparação falsa, por isso fica de fora das duas.
      continue;
    }
    const position = buildPosition(own);
    investedCents += position.investedCents;

    if (a.unitPriceCents === null || a.unitPriceCents === undefined) {
      missingPrice++;
      semPreco.push({ id: a.id, name: a.name });
      currentValueCents += position.costCents;
      // Nem os fluxos nem o valor: nada desta posição entra na comparação.
      foraDaComparacaoCents += position.investedCents;
      continue;
    }

    const valor = Math.round(position.quantity * a.unitPriceCents);
    currentValueCents += valor;
    valorComparavelCents += valor;
    flows.push(...position.flows);
    comparaveis.push({ bem: a, movimentos: own });
    if (position.firstDate && (!firstDate || position.firstDate < firstDate)) {
      firstDate = position.firstDate;
    }
  }

  if (flows.length === 0 || !firstDate) return null;

  const today = new Date().toISOString().slice(0, 10);
  // Só as entradas de dinheiro compram unidades do índice. As saídas (vendas,
  // dividendos) são dinheiro que deixou de estar investido dos dois lados.
  const benchmarks = await Promise.all(
    BENCHMARKS.map(async (b): Promise<BenchmarkResult> => {
      // Tenta os símbolos por ordem, e fica-se pelo primeiro que dê cotações.
      // A ordem já põe os que cotam em euros à frente, o que importa: um em
      // dólares mede o mercado e o câmbio à mistura.
      let series = null;
      let usado: (typeof b.symbols)[number] | null = null;
      for (const candidato of b.symbols) {
        const attempt = await getQuoteSeries(candidato.symbol, { since: firstDate });
        if (attempt.quotes.length > 0) {
          series = attempt;
          usado = candidato;
          break;
        }
        series = series ?? attempt;
      }
      if (!series || series.quotes.length === 0) {
        return {
          id: b.id,
          label: b.label,
          description: b.description,
          comparison: null,
          serie: [],
          problem: series?.problem ?? "Sem cotações para comparar.",
          lastDate: null,
          symbol: null,
          currency: null,
        };
      }
      const prices = quotesToPrices(
        series.quotes.map((q) => ({ date: q.date, closeCents: q.closeCents })),
      );
      // `valorComparavelCents` e não `currentValueCents`: ver o bloco lá em
      // cima. É o que impede um desnível fabricado por cotações em falta.
      const comparison = simulateBenchmark(flows, prices, valorComparavelCents, today);

      /**
       * A mesma comparação, mês a mês.
       *
       * **A carteira reconstrói-se pelas cotações guardadas de cada bem**, com
       * a razão contra o último fecho aplicada ao preço em euros de hoje — a
       * mesma conversão que a reconstrução do património já usa, e pela mesma
       * razão: é o que faz a moeda desaparecer sem precisar do câmbio de cada
       * dia. Um bem sem cotações nesse mês tira o mês inteiro da série, porque
       * uma carteira meia contada contra um índice inteiro não é comparação.
       */
      const serie = serieDaComparacao({
        fluxos: flows.filter((f) => f.amountCents > 0),
        precosDoIndice: prices,
        de: firstDate!,
        ate: today,
        carteiraEm: (dia) => {
          let total = 0;
          for (const { bem, movimentos } of comparaveis) {
            const simbolo = normalizeSymbol(String(bem.symbol ?? ""));
            const guardadas = simbolo ? (cotacoesPorSimbolo.get(simbolo) ?? []) : [];
            const ultima = guardadas.at(-1);
            if (!ultima || ultima.closeCents <= 0 || !bem.unitPriceCents) return null;

            const emEurosPorFecho = bem.unitPriceCents / ultima.closeCents;
            const precos: Record<string, number> = {};
            for (const q of guardadas) precos[q.date] = q.closeCents * emEurosPorFecho;
            const preco = precoNoDia(precos, dia);
            if (preco === null) return null;

            // As unidades que havia naquele dia, dos movimentos até lá.
            const ate = movimentos.filter((m) => m.date <= dia);
            if (ate.length === 0) continue;
            total += buildPosition(ate).quantity * preco;
          }
          return Math.round(total);
        },
      });

      /**
       * Porque é que não há comparação, dito com precisão.
       *
       * São dois motivos diferentes e a diferença importa a quem lê: sem
       * cotação de hoje é temporário e resolve-se sozinho; uma série que começa
       * depois do primeiro reforço nunca vai poder comparar este período, e a
       * pessoa merece saber que é esse o caso e não uma falha passageira.
       */
      let problem: string | null = null;
      if (!comparison) {
        const inicioSerie = series.quotes[0]?.date ?? null;
        const primeiroReforco = flows
          .map((f) => f.date)
          .sort()
          .at(0);
        problem =
          inicioSerie && primeiroReforco && primeiroReforco < inicioSerie
            ? `O índice só tem cotações desde ${inicioSerie} e o primeiro reforço é de ${primeiroReforco}. Comparar deixaria de fora parte do dinheiro e inflacionava o resultado.`
            : "Não há cotação na data de hoje para comparar.";
      }

      return {
        id: b.id,
        label: b.label,
        description: b.description,
        comparison,
        serie,
        problem,
        lastDate: series.lastDate,
        symbol: series.symbol,
        currency: usado?.currency ?? null,
      };
    }),
  );

  return {
    investedCents,
    currentValueCents,
    gainCents: currentValueCents - investedCents,
    /**
     * A taxa mede o que **está valorizado**, e não a carteira inteira.
     *
     * Os fluxos deixaram de levar as posições sem preço atual — ver o bloco lá
     * em cima — por isso o valor final tem de as deixar de fora também. Somar
     * um valor que inclui posições cujos reforços não estão nos fluxos dava uma
     * taxa inflacionada: dinheiro que aparece no fim sem ter entrado.
     */
    annualPct: xirr(flows, valorComparavelCents, today),
    firstDate,
    missingPrice,
    semPreco,
    /** Quanto dinheiro ficou de fora da comparação e da taxa. */
    foraDaComparacaoCents,
    benchmarks,
  };
}
