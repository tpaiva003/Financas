/**
 * Estes testes fixam os números contra a folha de Excel original (o exemplo
 * com FCF 5,564 mil milhões e 0,283 mil milhões de ações). Se algum falhar,
 * a app deixou de reproduzir a folha — e é a app que está errada.
 */
import { describe, expect, it } from "vitest";
import {
  computeScenario,
  computeValuation,
  type CompanyInputs,
  type Probabilities,
  type Scenarios,
  type ValuationParams,
} from "./valuation";

// Valores em mil milhões, como na folha
const company: CompanyInputs = {
  freeCashFlow: 5.564,
  sharesOutstanding: 0.283,
  netDebt: -0.435, // mais caixa do que dívida
  currentPrice: 409.75,
};

const params: ValuationParams = {
  discountRate: 8.5,
  terminalGrowth: 2,
  marginOfSafety: 30,
  projectionYears: 10,
};

const scenarios: Scenarios = {
  low: { years1to5: 6, years6to10: 5 },
  medium: { years1to5: 9, years6to10: 7 },
  high: { years1to5: 15, years6to10: 9 },
};

const probabilities: Probabilities = { low: 25, medium: 50, high: 25 };

describe("cenário baixo reproduz a folha", () => {
  const r = computeScenario(company, scenarios.low, params);

  it("fluxos de caixa por ano", () => {
    expect(r.years[0]!.cashFlow).toBeCloseTo(5.9, 2);
    expect(r.years[4]!.cashFlow).toBeCloseTo(7.45, 2);
    expect(r.years[9]!.cashFlow).toBeCloseTo(9.5, 2);
  });

  it("valores presentes por ano", () => {
    expect(r.years[0]!.presentValue).toBeCloseTo(5.44, 2);
    expect(r.years[1]!.presentValue).toBeCloseTo(5.31, 2);
    expect(r.years[9]!.presentValue).toBeCloseTo(4.2, 2);
  });

  it("valor terminal e o seu valor presente", () => {
    expect(r.terminalValue).toBeCloseTo(149.12, 1);
    expect(r.terminalValuePresent).toBeCloseTo(65.96, 1);
  });

  it("enterprise value e valor por ação", () => {
    expect(r.enterpriseValue).toBeCloseTo(114.37, 1);
    expect(r.intrinsicValue).toBeCloseTo(405.69, 1);
    expect(r.priceWithMargin).toBeCloseTo(283.98, 1);
    expect(r.upsidePct!).toBeCloseTo(-30.7, 1);
  });
});

describe("cenário médio reproduz a folha", () => {
  const r = computeScenario(company, scenarios.medium, params);

  it("fluxos e valor terminal", () => {
    expect(r.years[0]!.cashFlow).toBeCloseTo(6.06, 2);
    expect(r.years[9]!.cashFlow).toBeCloseTo(12.01, 2);
    expect(r.terminalValue).toBeCloseTo(188.42, 1);
  });

  it("enterprise value e valor por ação", () => {
    expect(r.enterpriseValue).toBeCloseTo(138.85, 1);
    expect(r.intrinsicValue).toBeCloseTo(492.17, 1);
    expect(r.priceWithMargin).toBeCloseTo(344.52, 1);
    expect(r.upsidePct!).toBeCloseTo(-15.9, 1);
  });
});

describe("cenário alto reproduz a folha", () => {
  const r = computeScenario(company, scenarios.high, params);

  it("fluxos e valor terminal", () => {
    expect(r.years[0]!.cashFlow).toBeCloseTo(6.4, 2);
    expect(r.years[9]!.cashFlow).toBeCloseTo(17.22, 2);
    expect(r.terminalValue).toBeCloseTo(270.21, 1);
  });

  it("enterprise value e valor por ação", () => {
    expect(r.enterpriseValue).toBeCloseTo(190.48, 1);
    expect(r.intrinsicValue).toBeCloseTo(674.6, 1);
    expect(r.priceWithMargin).toBeCloseTo(472.22, 1);
    expect(r.upsidePct!).toBeCloseTo(15.2, 1);
  });
});

describe("ponderação por probabilidade", () => {
  const v = computeValuation(company, scenarios, probabilities, params);

  it("preço ponderado e desvio", () => {
    expect(v.weightedPrice).toBeCloseTo(361.31, 1);
    expect(v.weightedUpsidePct!).toBeCloseTo(-11.8, 1);
  });

  it("veredicto: não atrativo a este preço", () => {
    expect(v.attractive).toBe(false);
  });

  it("sem avisos quando os pressupostos são coerentes", () => {
    expect(v.warnings).toEqual([]);
  });
});

describe("guardas contra pressupostos impossíveis", () => {
  it("avisa quando o crescimento perpétuo iguala ou passa a taxa de desconto", () => {
    const v = computeValuation(company, scenarios, probabilities, {
      ...params,
      discountRate: 2,
      terminalGrowth: 2,
    });
    expect(v.warnings.some((w) => w.includes("valor terminal é infinito"))).toBe(true);
  });

  it("avisa com fluxo de caixa negativo", () => {
    const v = computeValuation(
      { ...company, freeCashFlow: -1 },
      scenarios,
      probabilities,
      params,
    );
    expect(v.warnings.some((w) => w.includes("não é positivo"))).toBe(true);
  });

  it("avisa quando as probabilidades não somam 100", () => {
    const v = computeValuation(company, scenarios, { low: 20, medium: 50, high: 20 }, params);
    expect(v.warnings.some((w) => w.includes("90.0%"))).toBe(true);
  });

  it("probabilidades que não somam 100 são normalizadas, não ignoradas", () => {
    const a = computeValuation(company, scenarios, { low: 25, medium: 50, high: 25 }, params);
    const b = computeValuation(company, scenarios, { low: 50, medium: 100, high: 50 }, params);
    expect(b.weightedPrice).toBeCloseTo(a.weightedPrice, 6);
  });
});

describe("preço atual desconhecido", () => {
  const v = computeValuation(
    { ...company, currentPrice: null },
    scenarios,
    probabilities,
    params,
  );

  it("o valor intrínseco continua a ser calculado", () => {
    expect(v.medium.intrinsicValue).toBeCloseTo(492.17, 1);
  });

  it("mas não se inventa um veredicto sem preço de comparação", () => {
    expect(v.weightedUpsidePct).toBeNull();
    expect(v.attractive).toBeNull();
  });
});

describe("dívida líquida", () => {
  it("caixa líquida aumenta o valor por ação, dívida reduz", () => {
    const withCash = computeScenario(company, scenarios.medium, params);
    const withDebt = computeScenario({ ...company, netDebt: 10 }, scenarios.medium, params);
    expect(withDebt.intrinsicValue).toBeLessThan(withCash.intrinsicValue);
    // 10,435 mil milhões de diferença repartidos por 0,283 mil milhões de ações
    expect(withCash.intrinsicValue - withDebt.intrinsicValue).toBeCloseTo(10.435 / 0.283, 2);
  });
});
