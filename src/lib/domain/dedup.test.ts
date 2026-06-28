import { describe, it, expect } from "vitest";
import { stableUid, normalizeText, canonicalKey } from "./normalize";
import { detectDuplicates, suggestReconciliation } from "./dedup";
import type { Expense, NormalizedTransaction } from "./types";

function tx(p: Partial<NormalizedTransaction> & { amountCents: number }): NormalizedTransaction {
  return {
    source: p.source ?? "Activo Bank",
    description: p.description ?? "Continente Lisboa",
    amountCents: p.amountCents,
    currency: p.currency ?? "EUR",
    transactionDate: p.transactionDate ?? "2026-01-10",
    account: p.account ?? null,
    postedDate: p.postedDate ?? null,
  };
}

describe("normalizeText", () => {
  it("remove acentos, baixa e colapsa", () => {
    expect(normalizeText("  Café   da Manhã!! ")).toBe("cafe da manha");
    expect(normalizeText("CONTINENTE - Lisboa")).toBe("continente lisboa");
  });
});

describe("stableUid", () => {
  it("é determinístico para a mesma transação", () => {
    expect(stableUid(tx({ amountCents: 1234 }))).toBe(stableUid(tx({ amountCents: 1234 })));
  });

  it("é estável a diferenças de capitalização/acentos/espaços na descrição", () => {
    const a = stableUid(tx({ amountCents: 1234, description: "Café da Manhã" }));
    const b = stableUid(tx({ amountCents: 1234, description: "  cafe  da   manha " }));
    expect(a).toBe(b);
  });

  it("muda quando o montante muda", () => {
    expect(stableUid(tx({ amountCents: 1234 }))).not.toBe(stableUid(tx({ amountCents: 1235 })));
  });

  it("muda quando a fonte muda", () => {
    const a = stableUid(tx({ amountCents: 1234, source: "Activo Bank" }));
    const b = stableUid(tx({ amountCents: 1234, source: "Wizink" }));
    expect(a).not.toBe(b);
  });

  it("canonicalKey inclui os campos esperados", () => {
    expect(canonicalKey(tx({ amountCents: 1234 }))).toContain("|2026-01-10|1234|EUR|");
  });
});

function expenseFromTx(t: NormalizedTransaction, over: Partial<Expense> = {}): Expense {
  return {
    id: over.id ?? "x1",
    uid: over.uid ?? stableUid(t),
    description: t.description,
    amountCents: t.amountCents,
    currency: t.currency,
    transactionDate: t.transactionDate,
    payerId: "tiago",
    kind: "shared",
    split: { type: "EQUAL" },
    origin: over.origin ?? "import",
    status: "confirmed",
    ownerId: "tiago",
    createdBy: "tiago",
    createdAt: "2026-01-10T00:00:00Z",
    updatedAt: "2026-01-10T00:00:00Z",
    deletedAt: over.deletedAt ?? null,
    ...over,
  };
}

describe("detectDuplicates", () => {
  it("marca transações já existentes e conta novas", () => {
    const t1 = tx({ amountCents: 1000, description: "Continente" });
    const t2 = tx({ amountCents: 2000, description: "Galp" });
    const existing = [{ id: "e1", uid: stableUid(t1) }];

    const result = detectDuplicates([t1, t2], existing);
    expect(result.duplicateCount).toBe(1);
    expect(result.newCount).toBe(1);
    expect(result.rows[0]!.isDuplicate).toBe(true);
    expect(result.rows[0]!.existingExpenseId).toBe("e1");
    expect(result.rows[1]!.isDuplicate).toBe(false);
  });

  it("importar o mesmo ficheiro duas vezes não cria duplicados (dedup interno)", () => {
    const t1 = tx({ amountCents: 1000, description: "Continente" });
    const result = detectDuplicates([t1, t1], []);
    expect(result.newCount).toBe(1);
    expect(result.duplicateCount).toBe(1);
  });
});

describe("suggestReconciliation", () => {
  it("sugere casar uma despesa manual com a transação importada equivalente", () => {
    const manual = expenseFromTx(tx({ amountCents: 4599, description: "jantar restaurante" }), {
      id: "m1",
      origin: "manual",
      uid: "uid-manual-diferente",
      transactionDate: "2026-01-09",
    });
    const incoming = tx({ amountCents: 4599, description: "REST XYZ LISBOA", transactionDate: "2026-01-10" });

    const suggestions = suggestReconciliation([incoming], [manual], 3);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.candidateExpenseId).toBe("m1");
  });

  it("não sugere se a data estiver fora da tolerância", () => {
    const manual = expenseFromTx(tx({ amountCents: 4599 }), {
      id: "m1",
      origin: "manual",
      uid: "uid-manual",
      transactionDate: "2026-01-01",
    });
    const incoming = tx({ amountCents: 4599, transactionDate: "2026-01-20" });
    expect(suggestReconciliation([incoming], [manual], 3)).toHaveLength(0);
  });
});
