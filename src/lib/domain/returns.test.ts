import { describe, expect, it } from "vitest";
import {
  annualize,
  priceOn,
  simulateBenchmark,
  timeWeightedReturn,
  xirr,
  type CashFlow,
} from "./returns";

describe("xirr, o que o MEU dinheiro rendeu", () => {
  it("investimento único que duplica em dois anos dá cerca de 41% ao ano", () => {
    const r = xirr([{ date: "2024-01-01", amountCents: 100000 }], 200000, "2026-01-01");
    expect(r).toBeGreaterThan(40);
    expect(r).toBeLessThan(42);
  });

  it("um ano com 10% de ganho dá 10% ao ano", () => {
    const r = xirr([{ date: "2025-01-01", amountCents: 100000 }], 110000, "2026-01-01");
    expect(Math.round(r!)).toBe(10);
  });

  it("penaliza quando o dinheiro entrou tarde", () => {
    // Mesmo ganho absoluto, mas o segundo caso teve o dinheiro a render menos
    // tempo, por isso a taxa anual é maior.
    const cedo = xirr([{ date: "2025-01-01", amountCents: 100000 }], 110000, "2026-01-01")!;
    const tarde = xirr([{ date: "2025-10-01", amountCents: 100000 }], 110000, "2026-01-01")!;
    expect(tarde).toBeGreaterThan(cedo);
  });

  it("aguenta reforços irregulares", () => {
    const flows: CashFlow[] = [
      { date: "2024-01-15", amountCents: 500000 },
      { date: "2024-07-03", amountCents: 120000 },
      { date: "2025-02-20", amountCents: 300000 },
      { date: "2025-11-11", amountCents: 80000 },
    ];
    const r = xirr(flows, 1200000, "2026-08-05");
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0);
    expect(r!).toBeLessThan(100);
  });

  it("reconhece perdas", () => {
    const r = xirr([{ date: "2025-01-01", amountCents: 100000 }], 80000, "2026-01-01");
    expect(Math.round(r!)).toBe(-20);
  });

  it("devolve nulo quando não há resposta", () => {
    expect(xirr([], 1000, "2026-01-01")).toBeNull();
    // Só entradas, sem valor final: não há sinais opostos.
    expect(xirr([{ date: "2025-01-01", amountCents: 1000 }], 0, "2026-01-01")).toBeNull();
  });
});

describe("timeWeightedReturn, se o investimento foi bom", () => {
  it("ignora o efeito dos reforços", () => {
    // A carteira cresce 10% no primeiro troço, entra dinheiro, e cresce 10% no
    // segundo. A TWR é 21%, independentemente do tamanho do reforço.
    const semReforco = timeWeightedReturn([
      { date: "2025-01-01", valueCents: 100000, flowCents: 100000 },
      { date: "2025-06-01", valueCents: 110000, flowCents: 0 },
      { date: "2025-12-01", valueCents: 121000, flowCents: 0 },
    ])!;
    const comReforco = timeWeightedReturn([
      { date: "2025-01-01", valueCents: 100000, flowCents: 100000 },
      { date: "2025-06-01", valueCents: 110000, flowCents: 0 },
      // Entram 900 000, e depois cresce 10% sobre o total.
      { date: "2025-06-02", valueCents: 1010000, flowCents: 900000 },
      { date: "2025-12-01", valueCents: 1111000, flowCents: 0 },
    ])!;
    expect(Math.round(semReforco)).toBe(21);
    expect(Math.round(comReforco)).toBe(21);
  });

  it("um reforço sozinho não é lucro", () => {
    // É este o erro que a TWR evita: a carteira duplicou de valor, mas só
    // porque entrou dinheiro. Rentabilidade zero.
    const r = timeWeightedReturn([
      { date: "2025-01-01", valueCents: 100000, flowCents: 100000 },
      { date: "2025-02-01", valueCents: 200000, flowCents: 100000 },
    ]);
    expect(Math.round(r!)).toBe(0);
  });

  it("precisa de pelo menos dois pontos", () => {
    expect(timeWeightedReturn([])).toBeNull();
    expect(timeWeightedReturn([{ date: "2025-01-01", valueCents: 1, flowCents: 1 }])).toBeNull();
  });
});

describe("annualize", () => {
  it("reparte o ganho total pelos anos", () => {
    // 21% em dois anos são cerca de 10% ao ano, não 10,5%: os juros compõem.
    expect(Math.round(annualize(21, "2024-01-01", "2026-01-01")!)).toBe(10);
  });

  it("devolve nulo em períodos impossíveis", () => {
    expect(annualize(10, "2026-01-01", "2026-01-01")).toBeNull();
    expect(annualize(-150, "2024-01-01", "2026-01-01")).toBeNull();
  });
});

describe("simulateBenchmark, a comparação justa", () => {
  const precos = {
    "2025-01-01": 10000, // 100,00
    "2025-07-01": 12000, // 120,00
    "2026-01-01": 11000, // 110,00
  };

  it("aplica os mesmos reforços nas mesmas datas ao índice", () => {
    const flows: CashFlow[] = [
      { date: "2025-01-01", amountCents: 100000 }, // 10 unidades
      { date: "2025-07-01", amountCents: 120000 }, // 10 unidades
    ];
    const c = simulateBenchmark(flows, precos, 250000, "2026-01-01")!;
    // 20 unidades a 110,00 = 2200,00
    expect(c.benchmarkValueCents).toBe(220000);
    expect(c.investedCents).toBe(220000);
    expect(c.differenceCents).toBe(30000);
  });

  it("não deixa o índice levar crédito por subidas anteriores ao dinheiro", () => {
    // Todo o dinheiro entrou no fim, quando o índice já tinha subido e descido.
    // O índice não rende nada a esse dinheiro, e é isso que a comparação mostra.
    const c = simulateBenchmark(
      [{ date: "2026-01-01", amountCents: 100000 }],
      precos,
      100000,
      "2026-01-01",
    )!;
    expect(c.benchmarkValueCents).toBe(100000);
    expect(c.benchmarkReturnPct).toBe(0);
  });

  it("mostra quando se ficou atrás do índice", () => {
    const c = simulateBenchmark(
      [{ date: "2025-01-01", amountCents: 100000 }],
      precos,
      105000,
      "2026-01-01",
    )!;
    expect(c.benchmarkValueCents).toBe(110000);
    expect(c.differenceCents).toBe(-5000);
  });

  it("uma posição vendida com lucro não põe o índice em valores negativos", () => {
    /**
     * O caso que a carteira do Tiago tem e os testes não tinham: **vendas**.
     *
     * Compra de 10 000 € com o índice a 100, venda de tudo por 20 000 € com o
     * índice a 110. A carteira duplicou; o índice subiu 10%.
     *
     * A simulação tira do índice o mesmo dinheiro que saiu da carteira — e
     * 20 000 € a 110 são mais unidades do que as 100 que lá estavam. O índice
     * fica com **menos 81,8 unidades**, e o "valor no índice" saía a −9 000 €.
     * Um saldo negativo num sítio onde só se pode ter dinheiro ou não ter.
     *
     * O dinheiro que saiu não desapareceu: está na conta. Contá-lo dos dois
     * lados — a carteira também o recebeu — devolve os dois números ao mundo
     * real sem mexer na diferença entre eles.
     */
    const flows: CashFlow[] = [
      { date: "2025-01-01", amountCents: 1_000_000 },
      { date: "2026-01-01", amountCents: -2_000_000 },
    ];
    const c = simulateBenchmark(flows, precos, 0, "2026-01-01")!;

    // 10 000 € no índice a subir 10% valem 11 000 €. Não −9 000 €.
    expect(c.benchmarkValueCents).toBe(1_100_000);
    // A carteira não tem posições abertas, mas tem os 20 000 € que voltaram.
    expect(c.portfolioValueCents).toBe(2_000_000);
    expect(c.differenceCents).toBe(900_000);
    // O investido é o que se pôs, e não o que se pôs menos o que se tirou.
    expect(c.investedCents).toBe(1_000_000);
    expect(c.portfolioReturnPct).toBeCloseTo(100, 6);
    expect(c.benchmarkReturnPct).toBeCloseTo(10, 6);
  });

  it("um dividendo não apaga as percentagens", () => {
    // O dividendo é dinheiro que saiu do investimento para a conta. Antes
    // entrava no "investido" com sinal negativo e encolhia o denominador.
    const flows: CashFlow[] = [
      { date: "2025-01-01", amountCents: 1_000_000 },
      { date: "2026-01-01", amountCents: -50_000 },
    ];
    const c = simulateBenchmark(flows, precos, 1_100_000, "2026-01-01")!;

    expect(c.investedCents).toBe(1_000_000);
    // 1 100 000 em carteira + 50 000 recebidos = 1 150 000 sobre 1 000 000.
    expect(c.portfolioReturnPct).toBeCloseTo(15, 6);
    expect(c.benchmarkReturnPct).toBeCloseTo(10, 6);
  });

  it("devolve nulo sem cotação na data de referência", () => {
    expect(simulateBenchmark([], {}, 1000, "2026-01-01")).toBeNull();
  });
});

describe("priceOn", () => {
  const precos = { "2025-01-03": 100, "2025-01-06": 110 };

  it("usa a cotação exata quando existe", () => {
    expect(priceOn(precos, "2025-01-06")).toBe(110);
  });

  it("usa a última anterior em dias sem bolsa", () => {
    // 4 e 5 de janeiro de 2025 foram sábado e domingo.
    expect(priceOn(precos, "2025-01-05")).toBe(100);
  });

  it("devolve nulo antes da primeira cotação", () => {
    expect(priceOn(precos, "2024-12-31")).toBeNull();
  });
});
