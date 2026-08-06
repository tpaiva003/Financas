import { describe, expect, it } from "vitest";
import {
  buildPosition,
  buildPositionReturn,
  derivePosition,
  tradeAmountCents,
  type Trade,
} from "./positions";

function trade(p: Partial<Trade> & { id: string; date: string; kind: Trade["kind"] }): Trade {
  return {
    quantity: p.quantity ?? null,
    unitPriceCents: p.unitPriceCents ?? null,
    amountCents: p.amountCents ?? 0,
    ...p,
  };
}

describe("tradeAmountCents", () => {
  it("usa o valor escrito quando existe", () => {
    expect(tradeAmountCents(trade({ id: "1", date: "2026-01-05", kind: "compra", amountCents: 50_000 }))).toBe(50_000);
  });

  it("deriva de unidades x preço quando o valor falta", () => {
    expect(
      tradeAmountCents(
        trade({ id: "1", date: "2026-01-05", kind: "compra", quantity: 10, unitPriceCents: 9_250 }),
      ),
    ).toBe(92_500);
  });

  it("é sempre positivo", () => {
    expect(tradeAmountCents(trade({ id: "1", date: "2026-01-05", kind: "venda", amountCents: -5_000 }))).toBe(5_000);
  });
});

describe("buildPosition", () => {
  it("soma compras em unidades e em custo", () => {
    const p = buildPosition([
      trade({ id: "1", date: "2025-01-10", kind: "compra", quantity: 10, amountCents: 90_000 }),
      trade({ id: "2", date: "2025-06-10", kind: "compra", quantity: 10, amountCents: 110_000 }),
    ]);
    expect(p.quantity).toBe(20);
    expect(p.costCents).toBe(200_000);
    // Custo médio ponderado: 200.000 / 20.
    expect(p.unitCostCents).toBe(10_000);
    expect(p.investedCents).toBe(200_000);
  });

  it("uma venda reduz o custo pelo custo médio, não pelo preço de venda", () => {
    const p = buildPosition([
      trade({ id: "1", date: "2025-01-10", kind: "compra", quantity: 10, amountCents: 90_000 }),
      trade({ id: "2", date: "2025-06-10", kind: "compra", quantity: 10, amountCents: 110_000 }),
      trade({ id: "3", date: "2026-01-10", kind: "venda", quantity: 5, amountCents: 60_000 }),
    ]);
    expect(p.quantity).toBe(15);
    // Saíram 5 unidades a 100 EUR de custo médio: 50.000 de custo.
    expect(p.costCents).toBe(150_000);
    expect(p.unitCostCents).toBe(10_000);
    // Vendidas por 60.000 o que custou 50.000.
    expect(p.realizedGainCents).toBe(10_000);
    expect(p.proceedsCents).toBe(60_000);
  });

  it("dividendos não mexem no custo mas contam como ganho", () => {
    const p = buildPosition([
      trade({ id: "1", date: "2025-01-10", kind: "compra", quantity: 10, amountCents: 100_000 }),
      trade({ id: "2", date: "2025-12-10", kind: "dividendo", amountCents: 2_500 }),
    ]);
    expect(p.costCents).toBe(100_000);
    expect(p.quantity).toBe(10);
    expect(p.dividendsCents).toBe(2_500);
    expect(p.realizedGainCents).toBe(2_500);
  });

  it("comissões entram no custo da posição", () => {
    const p = buildPosition([
      trade({ id: "1", date: "2025-01-10", kind: "compra", quantity: 10, amountCents: 100_000 }),
      trade({ id: "2", date: "2025-01-10", kind: "custo", amountCents: 500 }),
    ]);
    expect(p.costCents).toBe(100_500);
    expect(p.investedCents).toBe(100_500);
    expect(p.quantity).toBe(10);
  });

  it("vender tudo deixa a posição a zero, sem restos de arredondamento", () => {
    const p = buildPosition([
      trade({ id: "1", date: "2025-01-10", kind: "compra", quantity: 3, amountCents: 10_000 }),
      trade({ id: "2", date: "2026-01-10", kind: "venda", quantity: 3, amountCents: 12_000 }),
    ]);
    expect(p.quantity).toBe(0);
    expect(p.costCents).toBe(0);
    expect(p.unitCostCents).toBeNull();
    expect(p.realizedGainCents).toBe(2_000);
  });

  it("assinala quando se vende mais do que se tem", () => {
    const p = buildPosition([
      trade({ id: "1", date: "2025-01-10", kind: "compra", quantity: 5, amountCents: 50_000 }),
      trade({ id: "2", date: "2026-01-10", kind: "venda", quantity: 8, amountCents: 90_000 }),
    ]);
    expect(p.oversold).toBe(true);
    expect(p.quantity).toBe(0);
  });

  it("processa por ordem de data, não pela ordem de registo", () => {
    const tarde = buildPosition([
      trade({ id: "2", date: "2026-01-10", kind: "venda", quantity: 5, amountCents: 60_000 }),
      trade({ id: "1", date: "2025-01-10", kind: "compra", quantity: 10, amountCents: 100_000 }),
    ]);
    expect(tarde.oversold).toBe(false);
    expect(tarde.quantity).toBe(5);
    expect(tarde.firstDate).toBe("2025-01-10");
    expect(tarde.lastDate).toBe("2026-01-10");
  });

  it("os fluxos têm o sinal certo para a TIR", () => {
    const p = buildPosition([
      trade({ id: "1", date: "2025-01-10", kind: "compra", quantity: 10, amountCents: 100_000 }),
      trade({ id: "2", date: "2025-12-10", kind: "dividendo", amountCents: 2_500 }),
      trade({ id: "3", date: "2026-01-10", kind: "venda", quantity: 2, amountCents: 25_000 }),
    ]);
    expect(p.flows).toEqual([
      { date: "2025-01-10", amountCents: 100_000 },
      { date: "2025-12-10", amountCents: -2_500 },
      { date: "2026-01-10", amountCents: -25_000 },
    ]);
  });

  it("sem movimentos não devolve posição nenhuma", () => {
    const p = buildPosition([]);
    expect(p.quantity).toBe(0);
    expect(p.firstDate).toBeNull();
    expect(p.flows).toEqual([]);
  });
});

describe("derivePosition", () => {
  const manual = { quantity: 100, unitCostCents: 9_200 };

  it("sem movimentos, vale o que foi escrito à mão", () => {
    const d = derivePosition(manual, []);
    expect(d.derived).toBe(false);
    expect(d.quantity).toBe(100);
    expect(d.unitCostCents).toBe(9_200);
    expect(d.position).toBeNull();
  });

  it("com movimentos, os movimentos substituem a posição manual e não se somam", () => {
    const d = derivePosition(manual, [
      trade({ id: "1", date: "2025-01-10", kind: "compra", quantity: 60, amountCents: 540_000 }),
      trade({ id: "2", date: "2025-06-10", kind: "compra", quantity: 40, amountCents: 380_000 }),
    ]);
    expect(d.derived).toBe(true);
    // 100 unidades, não 200.
    expect(d.quantity).toBe(100);
    expect(d.unitCostCents).toBe(9_200);
  });

  it("apagar os movimentos devolve o que estava escrito", () => {
    const comMovimentos = derivePosition(manual, [
      trade({ id: "1", date: "2025-01-10", kind: "compra", quantity: 5, amountCents: 50_000 }),
    ]);
    expect(comMovimentos.quantity).toBe(5);
    expect(derivePosition(manual, []).quantity).toBe(100);
  });
});

describe("buildPositionReturn", () => {
  const compras = [
    trade({ id: "1", date: "2025-01-01", kind: "compra", quantity: 10, amountCents: 100_000 }),
    trade({ id: "2", date: "2025-07-01", kind: "compra", quantity: 10, amountCents: 100_000 }),
  ];

  it("com cotação, separa valorização de ganho realizado", () => {
    const p = buildPosition(compras);
    const r = buildPositionReturn(p, 12_000, "2026-01-01");
    expect(r.currentValueCents).toBe(240_000);
    expect(r.unrealizedGainCents).toBe(40_000);
    expect(r.totalGainCents).toBe(40_000);
    expect(r.simpleReturnPct).toBeCloseTo(20, 5);
  });

  it("sem cotação, a posição vale o que custou e não se inventa ganho", () => {
    const p = buildPosition(compras);
    const r = buildPositionReturn(p, null, "2026-01-01");
    expect(r.currentValueCents).toBe(200_000);
    expect(r.unrealizedGainCents).toBeNull();
    expect(r.totalGainCents).toBeNull();
    expect(r.simpleReturnPct).toBeNull();
  });

  it("a TIR anual é maior que a simples quando metade do dinheiro entrou tarde", () => {
    const p = buildPosition(compras);
    const r = buildPositionReturn(p, 12_000, "2026-01-01");
    // 20% no total, mas metade do dinheiro só esteve investido meio ano: a taxa
    // anual que explica isto é bastante acima de 20%.
    expect(r.annualPct).not.toBeNull();
    expect(r.annualPct!).toBeGreaterThan(r.simpleReturnPct!);
  });

  it("um reforço mesmo antes da subida não conta como um ano de rendimento", () => {
    // Tudo igual, mas o segundo reforço entra no último dia.
    const tarde = buildPosition([
      trade({ id: "1", date: "2025-01-01", kind: "compra", quantity: 10, amountCents: 100_000 }),
      trade({ id: "2", date: "2025-12-31", kind: "compra", quantity: 10, amountCents: 100_000 }),
    ]);
    const cedo = buildPosition([
      trade({ id: "1", date: "2025-01-01", kind: "compra", quantity: 10, amountCents: 100_000 }),
      trade({ id: "2", date: "2025-01-02", kind: "compra", quantity: 10, amountCents: 100_000 }),
    ]);
    const rTarde = buildPositionReturn(tarde, 12_000, "2026-01-01");
    const rCedo = buildPositionReturn(cedo, 12_000, "2026-01-01");
    // O mesmo ganho em euros, mas quem só teve o dinheiro lá um dia tem uma
    // taxa anual muito mais alta: rendeu mais depressa.
    expect(rTarde.totalGainCents).toBe(rCedo.totalGainCents);
    expect(rTarde.annualPct!).toBeGreaterThan(rCedo.annualPct!);
  });

  it("sem movimentos não há taxa", () => {
    const r = buildPositionReturn(buildPosition([]), 12_000, "2026-01-01");
    expect(r.annualPct).toBeNull();
  });
});
