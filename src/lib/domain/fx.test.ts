import { describe, expect, it } from "vitest";
import { formatRate, fromEurCents, impliedRate, isForeign, toEurCents } from "./fx";

describe("isForeign", () => {
  it("o euro não é moeda estrangeira", () => {
    expect(isForeign("EUR")).toBe(false);
    expect(isForeign(null)).toBe(false);
    expect(isForeign(undefined)).toBe(false);
    expect(isForeign("USD")).toBe(true);
  });
});

describe("toEurCents", () => {
  it("divide pela taxa, que vem em moeda estrangeira por euro", () => {
    // 1.090 USD a 1,09 USD por EUR dá 1.000 EUR.
    expect(toEurCents(109_000, 1.09)).toBe(100_000);
  });

  it("recusa taxas impossíveis em vez de devolver um número errado", () => {
    expect(toEurCents(100_000, 0)).toBeNull();
    expect(toEurCents(100_000, -1)).toBeNull();
    expect(toEurCents(100_000, Number.NaN)).toBeNull();
  });
});

describe("fromEurCents", () => {
  it("faz o caminho inverso", () => {
    expect(fromEurCents(100_000, 1.09)).toBe(109_000);
  });

  it("ida e volta não perde mais do que o arredondamento", () => {
    const eur = toEurCents(123_456, 1.0912)!;
    const back = fromEurCents(eur, 1.0912)!;
    expect(Math.abs(back - 123_456)).toBeLessThanOrEqual(2);
  });
});

describe("impliedRate", () => {
  it("deriva a taxa dos dois valores da nota da corretora", () => {
    expect(impliedRate(109_000, 100_000)).toBeCloseTo(1.09, 6);
  });

  it("não inventa taxa sem valores", () => {
    expect(impliedRate(0, 100_000)).toBeNull();
    expect(impliedRate(109_000, 0)).toBeNull();
  });
});

describe("formatRate", () => {
  it("escreve à portuguesa com quatro casas", () => {
    expect(formatRate(1.0912)).toBe("1,0912");
  });
});
