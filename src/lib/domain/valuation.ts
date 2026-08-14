/**
 * Avaliação de empresas por fluxos de caixa descontados (DCF).
 *
 * Substitui a folha de Excel: três cenários (baixo, médio, alto), cada um com
 * uma taxa de crescimento para os anos 1-5 e outra para os 6-10, valor
 * terminal por crescimento perpétuo, margem de segurança e ponderação por
 * probabilidade.
 *
 * Tudo aqui é puro: sem I/O, sem datas, sem aleatoriedade. Os testes fixam os
 * números contra a folha original.
 */

export interface CompanyInputs {
  /** Fluxo de caixa livre do último ano fechado, em milhões */
  freeCashFlow: number;
  /** Ações em circulação, em milhões */
  sharesOutstanding: number;
  /** Dívida líquida (dívida menos caixa), em milhões. Negativa se houver mais caixa. */
  netDebt: number;
  /** Preço atual por ação. Null quando desconhecido — a margem fica sem comparação. */
  currentPrice: number | null;
}

export interface ScenarioGrowth {
  /** Crescimento anual do FCF nos anos 1 a 5, em % */
  years1to5: number;
  /** Crescimento anual do FCF nos anos 6 a 10, em % */
  years6to10: number;
}

export interface ValuationParams {
  /** Taxa de desconto / WACC, em % */
  discountRate: number;
  /** Crescimento perpétuo depois do ano 10, em % */
  terminalGrowth: number;
  /** Margem de segurança aplicada ao valor intrínseco, em % */
  marginOfSafety: number;
  /** Anos de projeção explícita (o Excel usa 10) */
  projectionYears: number;
}

export type ScenarioKey = "low" | "medium" | "high";

export interface Scenarios {
  low: ScenarioGrowth;
  medium: ScenarioGrowth;
  high: ScenarioGrowth;
}

export interface Probabilities {
  low: number;
  medium: number;
  high: number;
}

export interface YearProjection {
  year: number;
  cashFlow: number;
  growthRate: number;
  presentValue: number;
}

export interface ScenarioResult {
  years: YearProjection[];
  terminalValue: number;
  terminalValuePresent: number;
  enterpriseValue: number;
  equityValue: number;
  /** Valor intrínseco por ação, sem margem de segurança */
  intrinsicValue: number;
  /** Preço de compra depois de aplicar a margem de segurança */
  priceWithMargin: number;
  /** Diferença entre o preço com margem e o preço atual, em % */
  upsidePct: number | null;
}

export interface ValuationResult {
  low: ScenarioResult;
  medium: ScenarioResult;
  high: ScenarioResult;
  /** Média dos preços com margem, ponderada pelas probabilidades */
  weightedPrice: number;
  weightedUpsidePct: number | null;
  /** true quando o preço ponderado cobre o preço atual */
  attractive: boolean | null;
  warnings: string[];
}

const pct = (v: number) => v / 100;

/** Taxa de crescimento aplicável a um ano da projeção. */
function growthForYear(year: number, growth: ScenarioGrowth): number {
  return year <= 5 ? growth.years1to5 : growth.years6to10;
}

/**
 * Um cenário completo.
 *
 * O valor terminal usa Gordon: CF do último ano × (1 + g) / (r − g). Exige
 * r > g; caso contrário o valor é infinito e não faz sentido económico.
 */
export function computeScenario(
  company: CompanyInputs,
  growth: ScenarioGrowth,
  params: ValuationParams,
): ScenarioResult {
  const r = pct(params.discountRate);
  const g = pct(params.terminalGrowth);
  const years: YearProjection[] = [];

  let cashFlow = company.freeCashFlow;
  let sumPresentValues = 0;

  for (let year = 1; year <= params.projectionYears; year++) {
    const rate = growthForYear(year, growth);
    cashFlow = cashFlow * (1 + pct(rate));
    const presentValue = cashFlow / Math.pow(1 + r, year);
    sumPresentValues += presentValue;
    years.push({ year, cashFlow, growthRate: rate, presentValue });
  }

  const lastCashFlow = years[years.length - 1]?.cashFlow ?? company.freeCashFlow;
  const terminalValue = r > g ? (lastCashFlow * (1 + g)) / (r - g) : Number.POSITIVE_INFINITY;
  const terminalValuePresent = terminalValue / Math.pow(1 + r, params.projectionYears);

  const enterpriseValue = sumPresentValues + terminalValuePresent;
  const equityValue = enterpriseValue - company.netDebt;
  const intrinsicValue =
    company.sharesOutstanding > 0 ? equityValue / company.sharesOutstanding : 0;
  const priceWithMargin = intrinsicValue * (1 - pct(params.marginOfSafety));

  const upsidePct =
    company.currentPrice !== null && company.currentPrice > 0
      ? ((priceWithMargin - company.currentPrice) / company.currentPrice) * 100
      : null;

  return {
    years,
    terminalValue,
    terminalValuePresent,
    enterpriseValue,
    equityValue,
    intrinsicValue,
    priceWithMargin,
    upsidePct,
  };
}

/**
 * Avaliação completa: três cenários e a média ponderada.
 *
 * A ponderação usa os preços COM margem de segurança — é esse o preço a que
 * faz sentido comprar, e é assim que a folha original decide o veredicto.
 */
export function computeValuation(
  company: CompanyInputs,
  scenarios: Scenarios,
  probabilities: Probabilities,
  params: ValuationParams,
): ValuationResult {
  const warnings: string[] = [];

  if (params.discountRate <= params.terminalGrowth) {
    warnings.push(
      "A taxa de desconto tem de ser maior do que o crescimento perpétuo, senão o valor terminal é infinito.",
    );
  }
  if (company.freeCashFlow <= 0) {
    warnings.push(
      "O fluxo de caixa livre não é positivo: um DCF não diz nada de útil sobre esta empresa.",
    );
  }
  if (company.sharesOutstanding <= 0) {
    warnings.push("Sem ações em circulação não é possível calcular valor por ação.");
  }

  const total = probabilities.low + probabilities.medium + probabilities.high;
  if (Math.abs(total - 100) > 0.01) {
    warnings.push(`As probabilidades somam ${total.toFixed(1)}% em vez de 100%.`);
  }

  const low = computeScenario(company, scenarios.low, params);
  const medium = computeScenario(company, scenarios.medium, params);
  const high = computeScenario(company, scenarios.high, params);

  // Normaliza para que uma soma diferente de 100 não distorça o resultado
  const weights =
    total > 0
      ? { low: probabilities.low / total, medium: probabilities.medium / total, high: probabilities.high / total }
      : { low: 0, medium: 0, high: 0 };

  const weightedPrice =
    low.priceWithMargin * weights.low +
    medium.priceWithMargin * weights.medium +
    high.priceWithMargin * weights.high;

  const weightedUpsidePct =
    company.currentPrice !== null && company.currentPrice > 0
      ? ((weightedPrice - company.currentPrice) / company.currentPrice) * 100
      : null;

  return {
    low,
    medium,
    high,
    weightedPrice,
    weightedUpsidePct,
    attractive: weightedUpsidePct === null ? null : weightedUpsidePct >= 0,
    warnings,
  };
}

export const DEFAULT_PARAMS: ValuationParams = {
  discountRate: 8.5,
  terminalGrowth: 2,
  marginOfSafety: 30,
  projectionYears: 10,
};

export const DEFAULT_SCENARIOS: Scenarios = {
  low: { years1to5: 6, years6to10: 5 },
  medium: { years1to5: 9, years6to10: 7 },
  high: { years1to5: 15, years6to10: 9 },
};

export const DEFAULT_PROBABILITIES: Probabilities = { low: 25, medium: 50, high: 25 };
