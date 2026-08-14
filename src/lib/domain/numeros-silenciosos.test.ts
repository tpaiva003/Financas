/**
 * Três sítios onde a app devolvia um número errado sem levantar a voz.
 *
 * O padrão é o mesmo nos três: havia sempre uma resposta, e a resposta era
 * plausível. Ninguém tem como desconfiar de "100 anos", de "150%" ou de uma
 * mais-valia realizada — são números com o aspeto certo. É por isso que estão
 * aqui, e não misturados com os testes felizes de cada ficheiro.
 */

import { describe, expect, it } from "vitest";
import { buildPosition } from "./positions";
import { simulateBenchmark } from "./returns";
import { buildLoan } from "./loan";
import type { Trade } from "./positions";

describe("movimentos do mesmo dia não dependem da sorte do UUID", () => {
  /** Uma compra e uma venda no mesmo dia, com ids em ordens opostas. */
  function noMesmoDia(idCompra: string, idVenda: string): Trade[] {
    return [
      { id: "t0", date: "2026-01-01", kind: "compra", quantity: 100, amountCents: 100_000 },
      { id: idCompra, date: "2026-06-01", kind: "compra", quantity: 50, amountCents: 100_000 },
      { id: idVenda, date: "2026-06-01", kind: "venda", quantity: 50, amountCents: 100_000 },
    ];
  }

  it("a ordem dos ids não muda a mais-valia realizada", () => {
    // Antes: o desempate era pelo id, e os ids são UUID. Estes dois cenários
    // davam 500,00 e 333,33 de mais-valia realizada — à sorte.
    const a = buildPosition(noMesmoDia("aaa", "zzz"));
    const b = buildPosition(noMesmoDia("zzz", "aaa"));

    expect(a.realizedGainCents).toBe(b.realizedGainCents);
    expect(a.quantity).toBe(b.quantity);
    expect(a.costCents).toBe(b.costCents);
  });

  it("uma compra e uma venda no mesmo dia não contam como venda a descoberto", () => {
    const p = buildPosition([
      { id: "z", date: "2026-06-01", kind: "compra", quantity: 100, amountCents: 100_000 },
      { id: "a", date: "2026-06-01", kind: "venda", quantity: 50, amountCents: 60_000 },
    ]);
    expect(p.oversold).toBe(false);
    expect(p.quantity).toBe(50);
  });

  it("vender mesmo a mais continua a levantar o aviso", () => {
    const p = buildPosition([
      { id: "a", date: "2026-01-01", kind: "compra", quantity: 10, amountCents: 10_000 },
      { id: "b", date: "2026-02-01", kind: "venda", quantity: 40, amountCents: 40_000 },
    ]);
    expect(p.oversold).toBe(true);
  });
});

describe("a comparação com o índice não inflaciona o retorno", () => {
  // Série que só começa em 2024. O reforço de 2020 não é cotável.
  const precos = { "2024-01-01": 100_00, "2026-01-01": 125_00 };

  it("recusa comparar quando um reforço fica fora da série", () => {
    const r = simulateBenchmark(
      [
        { date: "2020-01-01", amountCents: 1_000_000 },
        { date: "2024-01-01", amountCents: 1_000_000 },
      ],
      precos,
      2_500_000,
      "2026-01-01",
    );
    // Antes: saltava o reforço de 2020 e o dinheiro dele, mas mantinha a
    // carteira inteira — 25% de retorno apresentados como 150%.
    expect(r).toBeNull();
  });

  it("compara quando todos os reforços têm cotação", () => {
    const r = simulateBenchmark(
      [{ date: "2024-01-01", amountCents: 1_000_000 }],
      precos,
      1_250_000,
      "2026-01-01",
    );
    expect(r).not.toBeNull();
    expect(r!.investedCents).toBe(1_000_000);
    expect(r!.portfolioReturnPct).toBeCloseTo(25, 6);
  });
});

describe("um empréstimo que nunca acaba não é um empréstimo a 100 anos", () => {
  it("uma prestação que mal cobre o juro não devolve um prazo", () => {
    // 300 000 a 3%: o juro do primeiro mês são 750,00. Uma prestação de 751,00
    // passa pela guarda do neverPaysOff e amortiza um euro por mês.
    const plano = buildLoan({
      principalCents: 30_000_000,
      annualRatePct: 3,
      monthlyPaymentCents: 75_100,
    });
    expect(plano.neverPaysOff).toBe(true);
    expect(plano.monthsToPayOff).toBeNull();
    expect(plano.totalInterestCents).toBeNull();
  });

  it("um empréstimo normal continua a dar prazo e juros", () => {
    const plano = buildLoan({
      principalCents: 10_000_00,
      annualRatePct: 3,
      monthlyPaymentCents: 500_00,
    });
    expect(plano.neverPaysOff).toBe(false);
    expect(plano.monthsToPayOff).toBeGreaterThan(0);
    expect(plano.totalInterestCents).not.toBeNull();
  });

  it("uma prestação que nem cobre o juro continua a ser apanhada", () => {
    const plano = buildLoan({
      principalCents: 30_000_000,
      annualRatePct: 3,
      monthlyPaymentCents: 70_000,
    });
    expect(plano.neverPaysOff).toBe(true);
  });
});
