import { describe, expect, it } from "vitest";
import {
  annualInterestCents,
  annuityPaymentCents,
  buildLoan,
  formatMonths,
  monthlyRate,
  payoffMonth,
  summariseRates,
} from "./loan";
import type { AssetInput } from "./networth";

describe("monthlyRate", () => {
  it("divide a taxa anual por doze", () => {
    expect(monthlyRate(3)).toBeCloseTo(0.0025, 10);
  });

  it("trata a ausência de taxa como zero", () => {
    expect(monthlyRate(null)).toBe(0);
    expect(monthlyRate(undefined)).toBe(0);
    expect(monthlyRate(0)).toBe(0);
  });
});

describe("annuityPaymentCents", () => {
  it("calcula a prestação de um crédito à habitação", () => {
    // 150.000 EUR a 3% por 30 anos: cerca de 632 EUR/mes.
    const p = annuityPaymentCents(15_000_000, 3, 360);
    expect(p).toBeGreaterThan(63_000);
    expect(p).toBeLessThan(63_500);
  });

  it("sem taxa, é a divisão simples", () => {
    expect(annuityPaymentCents(1_200_00, 0, 12)).toBe(10_000);
  });

  it("devolve zero sem capital ou sem prazo", () => {
    expect(annuityPaymentCents(0, 3, 360)).toBe(0);
    expect(annuityPaymentCents(1000, 3, 0)).toBe(0);
  });
});

describe("buildLoan", () => {
  it("com prestação indicada, diz quantos meses faltam", () => {
    const plan = buildLoan({
      principalCents: 15_000_000,
      annualRatePct: 3,
      monthlyPaymentCents: 63_240,
    });
    expect(plan.neverPaysOff).toBe(false);
    // Aproximadamente os 360 meses da anuidade correspondente.
    expect(plan.monthsToPayOff).toBeGreaterThan(350);
    expect(plan.monthsToPayOff).toBeLessThan(370);
    expect(plan.paymentIsEstimated).toBe(false);
  });

  it("sem prestação, estima-a a partir do prazo", () => {
    const plan = buildLoan({ principalCents: 15_000_000, annualRatePct: 3, termMonths: 360 });
    expect(plan.paymentIsEstimated).toBe(true);
    expect(plan.monthlyPaymentCents).toBe(annuityPaymentCents(15_000_000, 3, 360));
    expect(plan.monthsToPayOff).toBe(360);
  });

  it("a prestação real ganha ao prazo quando as duas são dadas", () => {
    // Prazo diz 360, mas quem paga adiantado acaba muito antes.
    const plan = buildLoan({
      principalCents: 15_000_000,
      annualRatePct: 3,
      termMonths: 360,
      monthlyPaymentCents: 100_000,
    });
    expect(plan.monthlyPaymentCents).toBe(100_000);
    expect(plan.monthsToPayOff!).toBeLessThan(300);
  });

  it("reparte a próxima prestação entre juro e capital", () => {
    const plan = buildLoan({
      principalCents: 15_000_000,
      annualRatePct: 3,
      monthlyPaymentCents: 63_240,
    });
    // 150.000 x 0,25% = 375 EUR de juro no primeiro mês.
    expect(plan.nextInterestCents).toBe(37_500);
    expect(plan.nextPrincipalCents).toBe(63_240 - 37_500);
  });

  it("avisa quando a prestação nem paga os juros", () => {
    const plan = buildLoan({
      principalCents: 15_000_000,
      annualRatePct: 3,
      monthlyPaymentCents: 30_000,
    });
    expect(plan.neverPaysOff).toBe(true);
    expect(plan.monthsToPayOff).toBeNull();
    expect(plan.nextPrincipalCents).toBe(0);
  });

  it("sem taxa, o prazo é o capital a dividir pela prestação", () => {
    const plan = buildLoan({ principalCents: 100_000, monthlyPaymentCents: 10_000 });
    expect(plan.monthsToPayOff).toBe(10);
    expect(plan.totalInterestCents).toBe(0);
  });

  it("a última prestação é só o que falta", () => {
    // 105 EUR a pagar 50 EUR/mes: 3 prestações, a última de 5 EUR.
    const plan = buildLoan({ principalCents: 10_500, monthlyPaymentCents: 5_000 });
    expect(plan.monthsToPayOff).toBe(3);
  });

  it("os juros totais batem certo num caso simples", () => {
    // 1.200 EUR a 12%/ano (1%/mes), 100 EUR de capital por mes mais juro.
    const plan = buildLoan({ principalCents: 120_000, annualRatePct: 12, termMonths: 12 });
    expect(plan.monthsToPayOff).toBe(12);
    // A prestação de anuidade ronda os 106,62 EUR: cerca de 79 EUR de juro total.
    expect(plan.totalInterestCents!).toBeGreaterThan(7_000);
    expect(plan.totalInterestCents!).toBeLessThan(9_000);
  });

  it("sem dados suficientes não inventa nada", () => {
    expect(buildLoan({ principalCents: 100_000 }).monthsToPayOff).toBeNull();
    expect(buildLoan({ principalCents: 0, monthlyPaymentCents: 5_000 }).monthsToPayOff).toBeNull();
  });
});

describe("payoffMonth", () => {
  it("conta o mês de partida como a primeira prestação", () => {
    expect(payoffMonth("2026-08-05", 1)).toBe("2026-08");
    expect(payoffMonth("2026-08-05", 6)).toBe("2027-01");
  });

  it("devolve nada sem prestações", () => {
    expect(payoffMonth("2026-08-05", 0)).toBeNull();
  });
});

describe("formatMonths", () => {
  it("escreve anos e meses como se fala", () => {
    expect(formatMonths(342)).toBe("28 anos e 6 meses");
    expect(formatMonths(12)).toBe("1 ano");
    expect(formatMonths(13)).toBe("1 ano e 1 mês");
    expect(formatMonths(1)).toBe("1 mês");
    expect(formatMonths(7)).toBe("7 meses");
    expect(formatMonths(0)).toBe("0 meses");
  });
});

describe("annualInterestCents", () => {
  it("aplica a taxa ao valor", () => {
    expect(annualInterestCents(1_000_000, 3)).toBe(30_000);
  });

  it("é zero sem taxa", () => {
    expect(annualInterestCents(1_000_000, null)).toBe(0);
  });
});

describe("summariseRates", () => {
  const assets: AssetInput[] = [
    { id: "1", name: "Depósito", kind: "conta", valueCents: 1_000_000, interestRatePct: 3 },
    { id: "2", name: "Conta à ordem", kind: "conta", valueCents: 500_000 },
    {
      id: "3",
      name: "Casa",
      kind: "divida",
      valueCents: 15_000_000,
      interestRatePct: 3,
      monthlyPaymentCents: 63_240,
    },
    { id: "4", name: "Carro", kind: "divida", valueCents: 500_000, monthlyPaymentCents: 20_000 },
  ];

  it("soma só os bens com taxa", () => {
    const s = summariseRates(assets);
    expect(s.annualInterestCents).toBe(30_000);
    expect(s.earningCount).toBe(1);
  });

  it("soma as prestações das dívidas", () => {
    const s = summariseRates(assets);
    expect(s.monthlyPaymentsCents).toBe(63_240 + 20_000);
    expect(s.amortisingCount).toBe(2);
  });

  it("conta o juro do próximo ano das dívidas, não o juro até ao fim", () => {
    const s = summariseRates(assets);
    expect(s.annualDebtInterestCents).toBe(450_000);
  });

  it("guarda a dívida que demora mais a acabar", () => {
    const s = summariseRates(assets);
    // O crédito da casa demora muito mais do que os 25 meses do carro.
    expect(s.lastPayoffMonths).toBeGreaterThan(300);
  });

  it("não se atrapalha com uma lista vazia", () => {
    const s = summariseRates([]);
    expect(s.annualInterestCents).toBe(0);
    expect(s.lastPayoffMonths).toBeNull();
  });
});
