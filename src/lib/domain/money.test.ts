import { describe, it, expect } from "vitest";
import { toCents, fromCents, formatCents, allocateByWeights } from "./money";

describe("toCents / fromCents", () => {
  it("converte sem erros de vírgula flutuante", () => {
    expect(toCents(12.34)).toBe(1234);
    expect(toCents(0.1 + 0.2)).toBe(30); // 0.30000000000000004
    expect(toCents(-5.5)).toBe(-550);
    expect(fromCents(1234)).toBeCloseTo(12.34);
  });
});

describe("formatCents", () => {
  it("formata em EUR (pt-PT)", () => {
    const s = formatCents(1234, "EUR");
    expect(s).toContain("12,34");
    expect(s).toContain("€");
  });
});

describe("allocateByWeights", () => {
  it("divide 100 cêntimos em 3 partes iguais sem perder cêntimos", () => {
    const r = allocateByWeights(100, [1, 1, 1]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(100);
    expect(r).toEqual([34, 33, 33]);
  });

  it("divide 50/50 um valor ímpar", () => {
    const r = allocateByWeights(2501, [1, 1]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(2501);
    expect(r).toEqual([1251, 1250]);
  });

  it("respeita pesos proporcionais", () => {
    const r = allocateByWeights(1000, [70, 30]);
    expect(r).toEqual([700, 300]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("funciona com montantes negativos (reembolsos)", () => {
    const r = allocateByWeights(-101, [1, 1]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(-101);
    // soma exata mantida mesmo com sinal negativo
    expect(Math.abs(r[0]! - r[1]!)).toBe(1);
  });

  it("lança se a soma dos pesos for zero", () => {
    expect(() => allocateByWeights(100, [0, 0])).toThrow();
  });

  it("lança com pesos negativos", () => {
    expect(() => allocateByWeights(100, [-1, 2])).toThrow();
  });
});
