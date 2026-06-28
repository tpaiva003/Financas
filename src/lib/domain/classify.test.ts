import { describe, it, expect } from "vitest";
import { classify, classifyForManualEntry, testRuleAgainstHistory } from "./classify";
import type { ClassificationRule } from "./types";

const rules: ClassificationRule[] = [
  { id: "r1", keyword: "continente", categoryId: "supermercado", kind: "shared", priority: 10, enabled: true },
  { id: "r2", keyword: "galp", categoryId: "combustivel", kind: "shared", priority: 20, enabled: true },
  { id: "r3", keyword: "spotify", categoryId: "subscricoes", kind: "personal", priority: 5, enabled: true },
  { id: "r4", keyword: "desativada", categoryId: "x", kind: "shared", priority: 1, enabled: false },
];

describe("classify", () => {
  it("apanha por palavra-chave, ignorando acentos/caixa", () => {
    const r = classify("CONTINENTE Modelo Lisboa", rules);
    expect(r.categoryId).toBe("supermercado");
    expect(r.kind).toBe("shared");
    expect(r.matchedRuleId).toBe("r1");
  });

  it("respeita a prioridade (menor primeiro)", () => {
    const r = classify("Spotify Continente", rules);
    // r3 (spotify, prio 5) avalia antes de r1 (continente, prio 10)
    expect(r.matchedRuleId).toBe("r3");
    expect(r.kind).toBe("personal");
  });

  it("ignora regras desativadas", () => {
    const r = classify("compra desativada", rules);
    expect(r.matchedRuleId).toBeUndefined();
  });

  it("devolve vazio quando nada casa", () => {
    const r = classify("transferência qualquer", rules);
    expect(r.categoryId).toBeUndefined();
    expect(r.kind).toBeUndefined();
  });
});

describe("classifyForManualEntry — invariante REQ-CLF-3", () => {
  it("preenche o que o utilizador não tocou", () => {
    const r = classifyForManualEntry("Continente", rules, {});
    expect(r.categoryId).toBe("supermercado");
    expect(r.kind).toBe("shared");
  });

  it("NÃO sobrepõe a escolha manual do utilizador", () => {
    const r = classifyForManualEntry("Continente", rules, { kind: true, category: true });
    expect(r.categoryId).toBeUndefined();
    expect(r.kind).toBeUndefined();
  });

  it("sobrepõe só o campo não tocado", () => {
    const r = classifyForManualEntry("Continente", rules, { kind: true });
    expect(r.categoryId).toBe("supermercado");
    expect(r.kind).toBeUndefined();
  });
});

describe("testRuleAgainstHistory", () => {
  it("devolve as descrições que a regra apanharia", () => {
    const hits = testRuleAgainstHistory({ keyword: "galp" }, [
      "GALP Energia",
      "Continente",
      "galp 1234 lisboa",
    ]);
    expect(hits).toEqual(["GALP Energia", "galp 1234 lisboa"]);
  });
});
