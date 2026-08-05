import { describe, expect, it } from "vitest";
import { assetValueCents, buildNetWorth, type AssetInput } from "./networth";

const conta: AssetInput = { id: "a1", name: "Depósito", kind: "conta", valueCents: 500000 };
const casa: AssetInput = { id: "a2", name: "Apartamento", kind: "imovel", valueCents: 18000000 };
const credito: AssetInput = { id: "a3", name: "Crédito habitação", kind: "divida", valueCents: 12000000 };
const etf: AssetInput = {
  id: "a4",
  name: "VWCE",
  kind: "investimento",
  quantity: 100,
  unitCostCents: 10000, // 100,00 € por unidade
  unitPriceCents: 12500, // 125,00 € hoje
};

describe("assetValueCents", () => {
  it("multiplica quantidade pelo preço atual nos investimentos", () => {
    expect(assetValueCents(etf)).toBe(1250000);
  });

  it("sem preço atual, usa o preço de compra", () => {
    // Não inventar valorização é o ponto: o ganho fica zero, não fica errado.
    expect(assetValueCents({ ...etf, unitPriceCents: null })).toBe(1000000);
  });

  it("usa o valor direto no resto", () => {
    expect(assetValueCents(casa)).toBe(18000000);
  });

  it("aguenta campos em falta sem rebentar", () => {
    expect(assetValueCents({ id: "x", name: "?", kind: "outro" })).toBe(0);
    expect(assetValueCents({ id: "y", name: "?", kind: "investimento" })).toBe(0);
  });
});

describe("buildNetWorth", () => {
  it("soma os bens e subtrai as dívidas", () => {
    const n = buildNetWorth([conta, casa, credito, etf]);
    expect(n.totalAssetsCents).toBe(500000 + 18000000 + 1250000);
    expect(n.totalLiabilitiesCents).toBe(12000000);
    expect(n.netCents).toBe(500000 + 18000000 + 1250000 - 12000000);
  });

  it("calcula ganho e percentagem dos investimentos", () => {
    const n = buildNetWorth([etf]);
    const view = n.assets[0]!;
    expect(view.costCents).toBe(1000000);
    expect(view.gainCents).toBe(250000);
    expect(Math.round(view.gainPct!)).toBe(25);
    expect(n.investmentGainCents).toBe(250000);
  });

  it("não reporta ganho quando falta o preço atual", () => {
    const n = buildNetWorth([{ ...etf, unitPriceCents: null }]);
    expect(n.assets[0]!.gainCents).toBeNull();
    expect(n.assets[0]!.missingPrice).toBe(true);
    expect(n.investmentsMissingPrice).toBe(1);
    // O ganho total só conta os que têm preço, para não misturar meias verdades.
    expect(n.investmentGainCents).toBe(0);
    expect(n.investmentCostCents).toBe(0);
  });

  it("reconhece perdas", () => {
    const n = buildNetWorth([{ ...etf, unitPriceCents: 8000 }]);
    expect(n.assets[0]!.gainCents).toBe(-200000);
    expect(Math.round(n.assets[0]!.gainPct!)).toBe(-20);
  });

  it("agrupa por tipo e ignora tipos vazios", () => {
    const n = buildNetWorth([conta, credito]);
    expect(n.byKind.map((k) => k.kind)).toEqual(["conta", "divida"]);
  });

  it("património pode ser negativo", () => {
    const n = buildNetWorth([{ id: "d", name: "Cartão", kind: "divida", valueCents: 300000 }]);
    expect(n.netCents).toBe(-300000);
  });

  it("sem bens, tudo a zero", () => {
    const n = buildNetWorth([]);
    expect(n.netCents).toBe(0);
    expect(n.byKind).toEqual([]);
  });
});
