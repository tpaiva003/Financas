import { describe, expect, it } from "vitest";
import {
  detectHoldingMapping,
  parsePriceCents,
  parseQuantity,
  rowsToHoldings,
} from "./holdings";

describe("parseQuantity", () => {
  it("lê o formato europeu", () => {
    expect(parseQuantity("1.234,56")).toBe(1234.56);
    expect(parseQuantity("12,5")).toBe(12.5);
  });

  it("lê o formato anglo-saxónico", () => {
    expect(parseQuantity("1,234.56")).toBe(1234.56);
    expect(parseQuantity("100")).toBe(100);
  });

  it("ignora símbolos e espaços", () => {
    expect(parseQuantity(" 1 250,00 € ")).toBe(1250);
    expect(parseQuantity("$99.90")).toBe(99.9);
  });

  it("devolve null no que não é número", () => {
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("Total")).toBeNull();
  });

  it("aceita frações de unidade", () => {
    expect(parseQuantity("0,5432")).toBe(0.5432);
  });
});

describe("parsePriceCents", () => {
  it("converte para cêntimos", () => {
    expect(parsePriceCents("125,40")).toBe(12540);
    expect(parsePriceCents("1.000,00")).toBe(100000);
  });

  it("devolve null quando não há preço", () => {
    expect(parsePriceCents("")).toBeNull();
  });
});

describe("detectHoldingMapping", () => {
  it("reconhece um extrato português", () => {
    const grid = [
      ["Carteira a 05/08/2026"],
      [],
      ["Nome", "Quantidade", "Preço médio", "Preço atual", "Valor de mercado"],
      ["VWCE", "100", "100,00", "125,00", "12500,00"],
    ];
    const m = detectHoldingMapping(grid)!;
    expect(m.headerRow).toBe(2);
    expect(m.nameCol).toBe(0);
    expect(m.quantityCol).toBe(1);
    expect(m.unitCostCol).toBe(2);
    expect(m.unitPriceCol).toBe(3);
    expect(m.marketValueCol).toBe(4);
  });

  it("reconhece um extrato em inglês", () => {
    const grid = [
      ["Symbol", "Shares", "Average price", "Last price", "Market value"],
      ["VOO", "10", "400.00", "520.00", "5200.00"],
    ];
    const m = detectHoldingMapping(grid)!;
    expect(m.nameCol).toBe(0);
    expect(m.quantityCol).toBe(1);
    expect(m.unitCostCol).toBe(2);
    expect(m.unitPriceCol).toBe(3);
  });

  it("não confunde preço médio com preço atual", () => {
    // "Preço médio" contém "preço": sem prioridade, roubava o papel ao atual.
    const grid = [["Ativo", "Qtd", "Preço médio", "Preço"], ["X", "1", "10", "12"]];
    const m = detectHoldingMapping(grid)!;
    expect(m.unitCostCol).toBe(2);
    expect(m.unitPriceCol).toBe(3);
  });

  it("basta saber o quê e quanto", () => {
    const grid = [["Instrumento", "Unidades"], ["IWDA", "42"]];
    const m = detectHoldingMapping(grid)!;
    expect(m.nameCol).toBe(0);
    expect(m.quantityCol).toBe(1);
    expect(m.unitCostCol).toBe(-1);
  });

  it("devolve null quando não reconhece nada", () => {
    expect(detectHoldingMapping([["a", "b"], ["1", "2"]])).toBeNull();
    expect(detectHoldingMapping([])).toBeNull();
  });
});

describe("rowsToHoldings", () => {
  const grid = [
    ["Nome", "Quantidade", "Preço médio", "Preço atual"],
    ["VWCE", "100", "100,00", "125,00"],
    ["IWDA", "50", "80,00", ""],
    ["", "", "", ""],
    ["Total", "", "", "12500,00"],
  ];

  it("converte as posições", () => {
    const rows = rowsToHoldings(grid, detectHoldingMapping(grid)!);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      name: "VWCE",
      quantity: 100,
      unitCostCents: 10000,
      unitPriceCents: 12500,
    });
  });

  it("deixa o preço atual a null quando não vem", () => {
    // É o que faz o ativo contar pelo custo em vez de fingir valorização.
    const rows = rowsToHoldings(grid, detectHoldingMapping(grid)!);
    expect(rows[1]!.unitPriceCents).toBeNull();
  });

  it("salta linhas vazias e linhas de total", () => {
    const rows = rowsToHoldings(grid, detectHoldingMapping(grid)!);
    expect(rows.map((r) => r.name)).toEqual(["VWCE", "IWDA"]);
  });

  it("deduz o preço a partir do valor de mercado", () => {
    const g = [
      ["Ativo", "Quantidade", "Valor de mercado"],
      ["SXR8", "4", "400,00"],
    ];
    const rows = rowsToHoldings(g, detectHoldingMapping(g)!);
    expect(rows[0]!.unitPriceCents).toBe(10000); // 400 / 4
  });

  it("ignora posições fechadas (quantidade zero)", () => {
    const g = [["Nome", "Quantidade"], ["Vendido", "0"], ["Aberto", "3"]];
    const rows = rowsToHoldings(g, detectHoldingMapping(g)!);
    expect(rows.map((r) => r.name)).toEqual(["Aberto"]);
  });
});
