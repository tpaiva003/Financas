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
  quotesToPrices,
  simulateBenchmark,
  xirr,
  type BenchmarkComparison,
  type CashFlow,
  type Trade,
} from "@/lib/domain";
import { getQuoteSeries } from "./quotes-service";

export interface BenchmarkResult {
  id: string;
  label: string;
  description: string;
  comparison: BenchmarkComparison | null;
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
  /** TIR anualizada da carteira toda. */
  annualPct: number | null;
  /** Data do primeiro movimento. */
  firstDate: string | null;
  /** Investimentos sem preço atual: o valor de hoje está incompleto. */
  missingPrice: number;
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

  const byAsset = new Map<string, Trade[]>();
  for (const t of trades) {
    byAsset.set(t.assetId, [...(byAsset.get(t.assetId) ?? []), t as Trade]);
  }

  const flows: CashFlow[] = [];
  let investedCents = 0;
  let currentValueCents = 0;
  let missingPrice = 0;
  let firstDate: string | null = null;

  for (const a of investments) {
    const own = byAsset.get(a.id) ?? [];
    if (own.length === 0) {
      // Posição escrita à mão, sem movimentos: entra no valor de hoje mas não
      // tem datas para entrar na comparação. Contá-la de um lado e não do
      // outro daria uma comparação falsa, por isso fica de fora das duas.
      continue;
    }
    const position = buildPosition(own);
    flows.push(...position.flows);
    investedCents += position.investedCents;
    if (a.unitPriceCents === null || a.unitPriceCents === undefined) {
      missingPrice++;
      currentValueCents += position.costCents;
    } else {
      currentValueCents += Math.round(position.quantity * a.unitPriceCents);
    }
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
          problem: series?.problem ?? "Sem cotações para comparar.",
          lastDate: null,
          symbol: null,
          currency: null,
        };
      }
      const prices = quotesToPrices(
        series.quotes.map((q) => ({ date: q.date, closeCents: q.closeCents })),
      );
      const comparison = simulateBenchmark(flows, prices, currentValueCents, today);
      return {
        id: b.id,
        label: b.label,
        description: b.description,
        comparison,
        problem: comparison ? null : "Não há cotação na data de hoje para comparar.",
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
    annualPct: xirr(flows, currentValueCents, today),
    firstDate,
    missingPrice,
    benchmarks,
  };
}
