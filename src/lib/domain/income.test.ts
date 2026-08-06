import { describe, expect, it } from "vitest";
import {
  averageSavingsRate,
  buildSavingsRate,
  isPassive,
  type IncomeEntry,
} from "./income";

const salario: IncomeEntry = {
  id: "1",
  kind: "salario",
  description: "Ordenado",
  amountCents: 200000,
  date: "2026-08-25",
};
const freelance: IncomeEntry = {
  id: "2",
  kind: "extra",
  description: "Projeto",
  amountCents: 50000,
  date: "2026-08-10",
};
const dividendos: IncomeEntry = {
  id: "3",
  kind: "dividendos",
  description: "VWCE",
  amountCents: 30000,
  date: "2026-08-15",
};

describe("isPassive", () => {
  it("salário e trabalhos paralelos são ativos", () => {
    expect(isPassive("salario")).toBe(false);
    expect(isPassive("extra")).toBe(false);
  });

  it("juros, dividendos e rendas são passivos", () => {
    expect(isPassive("juros")).toBe(true);
    expect(isPassive("dividendos")).toBe(true);
    expect(isPassive("renda")).toBe(true);
  });
});

describe("buildSavingsRate", () => {
  it("calcula quanto ficou e a percentagem", () => {
    const r = buildSavingsRate([salario, freelance], 150000, "2026-08");
    expect(r.incomeCents).toBe(250000);
    expect(r.savedCents).toBe(100000);
    expect(r.ratePct).toBe(40);
  });

  it("separa rendimento ativo de passivo", () => {
    const r = buildSavingsRate([salario, freelance, dividendos], 100000, "2026-08");
    expect(r.activeIncomeCents).toBe(250000);
    expect(r.passiveIncomeCents).toBe(30000);
  });

  it("mede quanto das despesas o rendimento passivo já paga", () => {
    // O mesmo indicador do FIRE, mas com dinheiro que entrou mesmo, em vez de
    // uma projeção sobre o património.
    const r = buildSavingsRate([salario, dividendos], 100000, "2026-08");
    expect(Math.round(r.passiveCoveragePct!)).toBe(30);
  });

  it("percentagem negativa quando se gasta mais do que se recebe", () => {
    const r = buildSavingsRate([salario], 300000, "2026-08");
    expect(r.savedCents).toBe(-100000);
    expect(r.ratePct).toBe(-50);
  });

  it("só conta o mês pedido", () => {
    const julho = { ...salario, id: "4", date: "2026-07-25" };
    const r = buildSavingsRate([salario, julho], 100000, "2026-08");
    expect(r.incomeCents).toBe(200000);
  });

  it("sem rendimento, a percentagem é nula e não zero", () => {
    // Zero por cento diria "não poupaste nada", que é diferente de "não sei".
    const r = buildSavingsRate([], 50000, "2026-08");
    expect(r.ratePct).toBeNull();
    expect(r.savedCents).toBe(-50000);
  });

  it("agrupa por tipo, do maior para o menor", () => {
    const r = buildSavingsRate([freelance, salario, dividendos], 0, "2026-08");
    expect(r.byKind.map((k) => k.kind)).toEqual(["salario", "extra", "dividendos"]);
  });

  it("a cobertura passiva nunca passa dos 100%", () => {
    const r = buildSavingsRate([{ ...dividendos, amountCents: 999999 }], 100000, "2026-08");
    expect(r.passiveCoveragePct).toBe(100);
  });
});

describe("averageSavingsRate", () => {
  it("pesa pelo dinheiro, não pelos meses", () => {
    // Um mês de 500 € e um de 5000 € não podem valer o mesmo na média: senão
    // um mês fraco com boa percentagem mascara um mês forte com má.
    const meses = [
      { incomeCents: 50000, expensesCents: 25000 }, // 50% de um valor pequeno
      { incomeCents: 500000, expensesCents: 475000 }, // 5% de um valor grande
    ];
    // Total poupado 50 000 de 550 000 recebidos, à volta de 9%.
    expect(Math.round(averageSavingsRate(meses)!)).toBe(9);
    // A média simples das percentagens daria 27,5%, que seria enganador.
  });

  it("devolve nulo quando não houve rendimento", () => {
    expect(averageSavingsRate([])).toBeNull();
    expect(averageSavingsRate([{ incomeCents: 0, expensesCents: 1000 }])).toBeNull();
  });
});
