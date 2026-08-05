import { describe, expect, it } from "vitest";
import { buildFire, yearsUntil } from "./fire";

const base = {
  netWorthCents: 5000000, // 50 000 €
  annualExpensesCents: 2400000, // 24 000 € por ano
  monthlySavingsCents: 100000, // 1 000 € por mês
};

describe("buildFire", () => {
  it("aplica a regra dos 4% ao gasto anual", () => {
    const f = buildFire(base);
    expect(f.fireNumberCents).toBe(60000000); // 24 000 / 0,04 = 600 000 €
    expect(f.remainingCents).toBe(60000000 - 5000000);
  });

  it("respeita outra taxa de levantamento", () => {
    const f = buildFire({ ...base, withdrawalRatePct: 3 });
    expect(f.fireNumberCents).toBe(80000000); // 24 000 / 0,03 = 800 000 €
  });

  it("mede o progresso e o rendimento que o património já dá", () => {
    const f = buildFire(base);
    expect(Math.round(f.progressPct)).toBe(8); // 50k de 600k
    // 50 000 € a 4% = 2 000 €/ano = 166,67 €/mês
    expect(f.currentMonthlyIncomeCents).toBe(16667);
    expect(Math.round(f.expensesCoveredPct)).toBe(8);
  });

  it("estima os anos que faltam", () => {
    const f = buildFire(base);
    // 50k, mais 12k/ano, a 5% real: à volta de duas décadas.
    expect(f.yearsToFire).toBeGreaterThan(18);
    expect(f.yearsToFire).toBeLessThan(24);
    expect(f.targetYear).toBeGreaterThan(new Date().getUTCFullYear());
  });

  it("diz que já lá está quando o património chega", () => {
    const f = buildFire({ ...base, netWorthCents: 60000000 });
    expect(f.remainingCents).toBe(0);
    expect(f.yearsToFire).toBe(0);
    expect(Math.round(f.progressPct)).toBe(100);
    expect(Math.round(f.expensesCoveredPct)).toBe(100);
  });

  it("sem poupança e sem património, nunca chega", () => {
    const f = buildFire({ ...base, netWorthCents: 0, monthlySavingsCents: 0 });
    expect(f.yearsToFire).toBeNull();
    expect(f.targetYear).toBeNull();
  });

  it("com dívidas (património negativo) continua a dar resposta", () => {
    const f = buildFire({ ...base, netWorthCents: -2000000 });
    expect(f.progressPct).toBeLessThan(0);
    expect(f.yearsToFire).not.toBeNull();
    expect(f.currentMonthlyIncomeCents).toBe(0);
  });

  it("sem gasto anual não há alvo", () => {
    const f = buildFire({ ...base, annualExpensesCents: 0 });
    expect(f.fireNumberCents).toBe(0);
    expect(f.progressPct).toBe(0);
    expect(f.expensesCoveredPct).toBe(0);
  });

  it("coast FIRE: quanto bastaria ter hoje sem poupar mais", () => {
    const f = buildFire(base);
    // 600 000 descontados 20 anos a 5% dá à volta de 226 000 €.
    expect(f.coastNumberCents).toBeGreaterThan(22000000);
    expect(f.coastNumberCents).toBeLessThan(23500000);
    expect(f.coastReached).toBe(false);
    expect(buildFire({ ...base, netWorthCents: 30000000 }).coastReached).toBe(true);
  });
});

describe("yearsUntil", () => {
  it("com retorno zero é divisão simples", () => {
    // 0 -> 1000, a poupar 100 por ano: 10 anos certos.
    expect(yearsUntil(0, 1000, 100, 0)).toBeCloseTo(10, 5);
  });

  it("devolve zero se o alvo já está atingido", () => {
    expect(yearsUntil(2000, 1000, 100, 0.05)).toBe(0);
  });

  it("juro composto encurta o caminho", () => {
    const semJuro = yearsUntil(0, 100000, 10000, 0)!;
    const comJuro = yearsUntil(0, 100000, 10000, 0.07)!;
    expect(comJuro).toBeLessThan(semJuro);
  });

  it("só com juros, sem aportes, ainda chega lá", () => {
    const anos = yearsUntil(50000, 100000, 0, 0.07);
    expect(anos).toBeGreaterThan(9);
    expect(anos).toBeLessThan(11);
  });

  it("devolve null quando é impossível", () => {
    expect(yearsUntil(1000, 100000, 0, 0)).toBeNull();
    expect(yearsUntil(-5000, 100000, 0, 0.05)).toBeNull();
  });

  it("devolve null se demorasse mais do que um século", () => {
    expect(yearsUntil(0, 100000000, 1, 0)).toBeNull();
  });
});
