/**
 * Fonte de dados: Yahoo Finance (via yahoo-finance2).
 *
 * Escolhida por não exigir chave nem subscrição: a app funciona
 * imediatamente. Em troca, é uma API não oficial — daí o cuidado em tratar
 * cada campo como opcional e em devolver `null` sempre que a resposta não
 * traz o valor, em vez de assumir zeros.
 */
import yahooFinance from "yahoo-finance2";
import {
  SymbolNotFoundError,
  type CompanyFinancials,
  type HistoricalYear,
  type MarketDataProvider,
} from "./types";

/** Converte de unidades para milhões, preservando o null. */
function toMillions(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v / 1_000_000 : null;
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Percentagem a partir de um rácio (0,183 → 18,3). */
function ratioToPct(v: number | null | undefined): number | null {
  const n = num(v);
  return n === null ? null : n * 100;
}

function divPct(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return (a / b) * 100;
}

/**
 * ROCE = EBIT / capital empregue, com capital empregue = ativo total menos
 * passivo corrente. É a definição que a folha original usa.
 */
function computeRoce(
  ebit: number | null,
  totalAssets: number | null,
  currentLiabilities: number | null,
): number | null {
  if (ebit === null || totalAssets === null || currentLiabilities === null) return null;
  const capitalEmployed = totalAssets - currentLiabilities;
  if (capitalEmployed <= 0) return null;
  return (ebit / capitalEmployed) * 100;
}

type AnyRecord = Record<string, unknown>;

function pick(obj: unknown, ...path: string[]): number | null {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return null;
    cur = (cur as AnyRecord)[key];
  }
  // yahoo-finance2 devolve ora números crus ora { raw: n }
  if (typeof cur === "number") return Number.isFinite(cur) ? cur : null;
  if (cur !== null && typeof cur === "object" && "raw" in (cur as AnyRecord)) {
    const raw = (cur as AnyRecord).raw;
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  }
  return null;
}

export const yahooProvider: MarketDataProvider = {
  name: "Yahoo Finance",

  async fetchCompany(symbol: string): Promise<CompanyFinancials> {
    const clean = symbol.trim().toUpperCase();
    if (clean.length === 0) throw new SymbolNotFoundError(symbol);

    let summary: AnyRecord;
    try {
      summary = (await yahooFinance.quoteSummary(clean, {
        modules: [
          "price",
          "summaryProfile",
          "financialData",
          "defaultKeyStatistics",
          "incomeStatementHistory",
          "balanceSheetHistory",
          "cashflowStatementHistory",
          "earningsTrend",
        ],
      })) as unknown as AnyRecord;
    } catch (err) {
      const message = String(err);
      if (/not found|No fundamentals|404/i.test(message)) throw new SymbolNotFoundError(clean);
      throw new Error(`A fonte de dados falhou para "${clean}": ${message}`);
    }

    if (summary === null || typeof summary !== "object") throw new SymbolNotFoundError(clean);

    const price = summary.price as AnyRecord | undefined;
    const profile = summary.summaryProfile as AnyRecord | undefined;
    const fin = summary.financialData as AnyRecord | undefined;
    const stats = summary.defaultKeyStatistics as AnyRecord | undefined;

    const incomeRows = ((summary.incomeStatementHistory as AnyRecord | undefined)
      ?.incomeStatementHistory ?? []) as AnyRecord[];
    const balanceRows = ((summary.balanceSheetHistory as AnyRecord | undefined)
      ?.balanceSheetStatements ?? []) as AnyRecord[];
    const cashRows = ((summary.cashflowStatementHistory as AnyRecord | undefined)
      ?.cashflowStatements ?? []) as AnyRecord[];

    const freeCashFlow = toMillions(pick(fin, "freeCashflow"));
    const sharesOutstanding = toMillions(pick(stats, "sharesOutstanding"));
    const totalDebt = toMillions(pick(fin, "totalDebt"));
    const cash = toMillions(pick(fin, "totalCash"));
    const netDebt = totalDebt !== null && cash !== null ? totalDebt - cash : null;
    const currentPrice = pick(fin, "currentPrice") ?? pick(price, "regularMarketPrice");

    // Histórico: junta as três demonstrações pelo ano fiscal
    const history: HistoricalYear[] = [];
    const yearsCount = Math.max(incomeRows.length, balanceRows.length, cashRows.length);
    for (let i = 0; i < yearsCount; i++) {
      const income = incomeRows[i];
      const balance = balanceRows[i];
      const cashflow = cashRows[i];

      const endDate =
        (income?.endDate as Date | undefined) ??
        (balance?.endDate as Date | undefined) ??
        (cashflow?.endDate as Date | undefined);
      const year = endDate instanceof Date ? endDate.getUTCFullYear() : Number.NaN;
      if (!Number.isFinite(year)) continue;

      const revenue = toMillions(pick(income, "totalRevenue"));
      const netIncome = toMillions(pick(income, "netIncome"));
      const ebit = toMillions(pick(income, "ebit")) ?? toMillions(pick(income, "operatingIncome"));
      const totalAssets = toMillions(pick(balance, "totalAssets"));
      const currentLiabilities = toMillions(pick(balance, "totalCurrentLiabilities"));

      const operatingCashFlow = toMillions(pick(cashflow, "totalCashFromOperatingActivities"));
      const capex = toMillions(pick(cashflow, "capitalExpenditures"));
      // capex vem negativo no Yahoo; somar dá operacional − investimento
      const fcf =
        operatingCashFlow !== null && capex !== null ? operatingCashFlow + capex : null;

      history.push({
        year,
        freeCashFlow: fcf,
        revenue,
        netIncome,
        roce: computeRoce(ebit, totalAssets, currentLiabilities),
        netMargin: divPct(netIncome, revenue),
        fcfMargin: divPct(fcf, revenue),
      });
    }

    // Estimativas de analistas: entradas +1y/+5y do earningsTrend
    const trends = ((summary.earningsTrend as AnyRecord | undefined)?.trend ?? []) as AnyRecord[];
    const nextYear = trends.find((t) => t.period === "+1y");
    const analystRevenueGrowth = ratioToPct(pick(nextYear, "revenueEstimate", "growth"));
    const analystEarningsGrowth = ratioToPct(pick(nextYear, "earningsEstimate", "growth"));

    const latest = history[0];
    const metrics = {
      grossMargin: ratioToPct(pick(fin, "grossMargins")),
      operatingMargin: ratioToPct(pick(fin, "operatingMargins")),
      netMargin: ratioToPct(pick(fin, "profitMargins")),
      roce: latest?.roce ?? null,
      roe: ratioToPct(pick(fin, "returnOnEquity")),
      debtToEquity: num(pick(fin, "debtToEquity")),
      fcfMargin: divPct(freeCashFlow, latest?.revenue ?? null),
      currentRatio: num(pick(fin, "currentRatio")),
    };

    const missing: string[] = [];
    if (freeCashFlow === null) missing.push("fluxo de caixa livre");
    if (sharesOutstanding === null) missing.push("ações em circulação");
    if (netDebt === null) missing.push("dívida líquida");
    if (currentPrice === null) missing.push("preço atual");

    return {
      symbol: clean,
      name: (price?.longName as string | undefined) ?? (price?.shortName as string | undefined) ?? null,
      currency: (price?.currency as string | undefined) ?? null,
      sector: (profile?.sector as string | undefined) ?? null,
      industry: (profile?.industry as string | undefined) ?? null,
      freeCashFlow,
      sharesOutstanding,
      totalDebt,
      cash,
      netDebt,
      currentPrice,
      metrics,
      history,
      analystRevenueGrowth,
      analystEarningsGrowth,
      source: "Yahoo Finance",
      fetchedAt: new Date().toISOString(),
      missing,
    };
  },
};
