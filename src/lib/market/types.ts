/**
 * Dados de mercado necessários para uma avaliação.
 *
 * Regra que atravessa este módulo: **campo que a fonte não dá é `null`**.
 * Nunca se preenche por estimativa — um número inventado aqui propaga-se para
 * o valor por ação e para o veredicto de compra.
 */

/** Um ano de histórico, para perceber a trajetória e não só o retrato de hoje. */
export interface HistoricalYear {
  /** Ano fiscal a que respeita */
  year: number;
  /** Fluxo de caixa livre, em milhões */
  freeCashFlow: number | null;
  /** Receita, em milhões */
  revenue: number | null;
  /** Resultado líquido, em milhões */
  netIncome: number | null;
  /** Return on capital employed, em % */
  roce: number | null;
  /** Margem líquida, em % */
  netMargin: number | null;
  /** Margem de fluxo de caixa livre, em % */
  fcfMargin: number | null;
}

/** Métricas do retrato atual, para comparar com o setor. */
export interface CurrentMetrics {
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  roce: number | null;
  roe: number | null;
  debtToEquity: number | null;
  fcfMargin: number | null;
  currentRatio: number | null;
}

export interface CompanyFinancials {
  symbol: string;
  name: string | null;
  currency: string | null;
  sector: string | null;
  industry: string | null;

  /** Fluxo de caixa livre dos últimos doze meses, em milhões */
  freeCashFlow: number | null;
  /** Ações em circulação, em milhões */
  sharesOutstanding: number | null;
  /** Dívida total, em milhões */
  totalDebt: number | null;
  /** Caixa e equivalentes, em milhões */
  cash: number | null;
  /** Dívida líquida (dívida menos caixa), em milhões */
  netDebt: number | null;
  currentPrice: number | null;

  metrics: CurrentMetrics;
  /** Do mais recente para o mais antigo */
  history: HistoricalYear[];

  /** Crescimento médio de receita estimado por analistas para os próximos anos, em % */
  analystRevenueGrowth: number | null;
  /** Crescimento médio de lucros estimado por analistas, em % */
  analystEarningsGrowth: number | null;

  /** Nome da fonte, mostrado ao utilizador */
  source: string;
  fetchedAt: string;
  /** Campos que a fonte não conseguiu dar — mostrados para o utilizador preencher à mão */
  missing: string[];
}

export interface MarketDataProvider {
  name: string;
  fetchCompany(symbol: string): Promise<CompanyFinancials>;
}

export class SymbolNotFoundError extends Error {
  constructor(symbol: string) {
    super(`Não encontrei nenhuma empresa com o símbolo "${symbol}".`);
    this.name = "SymbolNotFoundError";
  }
}
