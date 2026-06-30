import { describe, it, expect } from "vitest";
import { computeShares, validateSplit, equalSplit, percentSplit } from "./split";
import type { Split } from "./types";

const A = "user-a";
const B = "user-b";
const users = [A, B];

describe("computeShares — EQUAL (default 50/50)", () => {
  it("divide igual e a soma bate certo", () => {
    const shares = computeShares(2501, equalSplit(), users);
    expect(shares[A]! + shares[B]!).toBe(2501);
    expect(shares[A]).toBe(1251);
    expect(shares[B]).toBe(1250);
  });
});

describe("computeShares — PERCENT", () => {
  it("aplica 70/30", () => {
    const shares = computeShares(1000, percentSplit({ [A]: 70, [B]: 30 }), users);
    expect(shares[A]).toBe(700);
    expect(shares[B]).toBe(300);
  });

  it("rejeita percentagens que não somam 100", () => {
    const bad: Split = { type: "PERCENT", weights: { [A]: 60, [B]: 30 } };
    expect(validateSplit(bad, users, 1000).ok).toBe(false);
    expect(() => computeShares(1000, bad, users)).toThrow();
  });
});

describe("computeShares — SHARES", () => {
  it("divide por quotas (2:1)", () => {
    const shares = computeShares(900, { type: "SHARES", weights: { [A]: 2, [B]: 1 } }, users);
    expect(shares[A]).toBe(600);
    expect(shares[B]).toBe(300);
    expect(shares[A]! + shares[B]!).toBe(900);
  });
});

describe("computeShares — FIXED", () => {
  it("usa montantes fixos quando somam o total", () => {
    const shares = computeShares(1000, { type: "FIXED", weights: { [A]: 250, [B]: 750 } }, users);
    expect(shares[A]).toBe(250);
    expect(shares[B]).toBe(750);
  });

  it("rejeita quando os fixos não somam o total", () => {
    const bad: Split = { type: "FIXED", weights: { [A]: 250, [B]: 700 } };
    expect(validateSplit(bad, users, 1000).ok).toBe(false);
    expect(() => computeShares(1000, bad, users)).toThrow();
  });
});

describe("computeShares — valores negativos (reembolso)", () => {
  it("divide um reembolso 50/50 mantendo a soma", () => {
    const shares = computeShares(-1001, equalSplit(), users);
    expect(shares[A]! + shares[B]!).toBe(-1001);
  });
});
