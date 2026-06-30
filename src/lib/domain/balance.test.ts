import { describe, it, expect } from "vitest";
import { computeBalance, pairwiseStatement, countsTowardsBalance, simplifyDebts } from "./balance";
import { equalSplit, percentSplit } from "./split";
import type { Expense, Settlement, Split } from "./types";

const A = "tiago";
const B = "clara";
const users = [A, B];

let seq = 0;
function expense(partial: Partial<Expense> & { amountCents: number; payerId: string }): Expense {
  seq += 1;
  return {
    id: `e${seq}`,
    uid: `uid${seq}`,
    description: partial.description ?? "Despesa",
    currency: "EUR",
    transactionDate: partial.transactionDate ?? "2026-01-01",
    kind: partial.kind ?? "shared",
    split: partial.split ?? equalSplit(),
    origin: partial.origin ?? "manual",
    status: partial.status ?? "confirmed",
    ownerId: partial.ownerId ?? partial.payerId,
    createdBy: partial.payerId,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: partial.deletedAt ?? null,
    ...partial,
  };
}

function settlement(p: Partial<Settlement> & { fromUserId: string; toUserId: string; amountCents: number }): Settlement {
  seq += 1;
  return {
    id: `s${seq}`,
    fromUserId: p.fromUserId,
    toUserId: p.toUserId,
    amountCents: p.amountCents,
    currency: "EUR",
    date: p.date ?? "2026-02-01",
    note: p.note ?? null,
    createdBy: p.fromUserId,
    createdAt: "2026-02-01T00:00:00Z",
  };
}

describe("computeBalance", () => {
  it("A paga 100 e divide 50/50 → B deve 50 a A", () => {
    const { netByUser } = computeBalance({
      users,
      expenses: [expense({ amountCents: 10000, payerId: A })],
      settlements: [],
    });
    expect(netByUser[A]).toBe(5000);
    expect(netByUser[B]).toBe(-5000);

    const stmt = pairwiseStatement(netByUser, A, B);
    expect(stmt.settled).toBe(false);
    expect(stmt.debtorId).toBe(B);
    expect(stmt.creditorId).toBe(A);
    expect(stmt.amountCents).toBe(5000);
  });

  it("o net soma sempre zero entre os dois", () => {
    const { netByUser } = computeBalance({
      users,
      expenses: [
        expense({ amountCents: 3333, payerId: A }),
        expense({ amountCents: 8888, payerId: B, split: percentSplit({ [A]: 70, [B]: 30 }) }),
      ],
      settlements: [],
    });
    expect(netByUser[A]! + netByUser[B]!).toBe(0);
  });

  it("um acerto reduz/zera o saldo", () => {
    const { netByUser } = computeBalance({
      users,
      expenses: [expense({ amountCents: 10000, payerId: A })],
      settlements: [settlement({ fromUserId: B, toUserId: A, amountCents: 5000 })],
    });
    expect(netByUser[A]).toBe(0);
    expect(netByUser[B]).toBe(0);
    expect(pairwiseStatement(netByUser, A, B).settled).toBe(true);
  });

  it("despesas pessoais NÃO entram no saldo", () => {
    const e = expense({ amountCents: 5000, payerId: A, kind: "personal" });
    expect(countsTowardsBalance(e)).toBe(false);
    const { netByUser } = computeBalance({ users, expenses: [e], settlements: [] });
    expect(netByUser[A]).toBe(0);
    expect(netByUser[B]).toBe(0);
  });

  it("despesas pendentes NÃO entram no saldo até confirmar", () => {
    const e = expense({ amountCents: 5000, payerId: A, status: "pending" });
    expect(countsTowardsBalance(e)).toBe(false);
    const { netByUser } = computeBalance({ users, expenses: [e], settlements: [] });
    expect(netByUser[A]).toBe(0);
  });

  it("despesas por aprovar/rejeitadas NÃO entram no saldo", () => {
    const pendente = expense({ amountCents: 5000, payerId: A, approvalStatus: "pending" });
    const rejeitada = expense({ amountCents: 5000, payerId: A, approvalStatus: "rejected" });
    expect(countsTowardsBalance(pendente)).toBe(false);
    expect(countsTowardsBalance(rejeitada)).toBe(false);
    const { netByUser } = computeBalance({ users, expenses: [pendente, rejeitada], settlements: [] });
    expect(netByUser[A]).toBe(0);
  });

  it("despesas eliminadas (soft-delete) NÃO entram no saldo", () => {
    const e = expense({ amountCents: 5000, payerId: A, deletedAt: "2026-01-05T00:00:00Z" });
    expect(countsTowardsBalance(e)).toBe(false);
    const { netByUser } = computeBalance({ users, expenses: [e], settlements: [] });
    expect(netByUser[A]).toBe(0);
  });

  it("o saldo é explicável: há uma contribuição por despesa/acerto e somam o net", () => {
    const { contributions, netByUser } = computeBalance({
      users,
      expenses: [
        expense({ amountCents: 10000, payerId: A, description: "Jantar" }),
        expense({ amountCents: 2000, payerId: B, description: "Café" }),
      ],
      settlements: [settlement({ fromUserId: B, toUserId: A, amountCents: 1000 })],
    });
    expect(contributions).toHaveLength(3);
    const jantar = contributions.find((c) => c.description === "Jantar")!;
    expect(jantar.deltas[A]).toBe(5000);
    expect(jantar.deltas[B]).toBe(-5000);
    // a soma das contribuições por utilizador reproduz exatamente o net
    const sumA = contributions.reduce((acc, c) => acc + (c.deltas[A] ?? 0), 0);
    const sumB = contributions.reduce((acc, c) => acc + (c.deltas[B] ?? 0), 0);
    expect(sumA).toBe(netByUser[A]);
    expect(sumB).toBe(netByUser[B]);
    expect(sumA).toBe(3000);
  });

  it("simplifyDebts: 2 pessoas", () => {
    const transfers = simplifyDebts({ a: 5000, b: -5000 });
    expect(transfers).toEqual([{ fromUserId: "b", toUserId: "a", amountCents: 5000 }]);
  });

  it("simplifyDebts: 3 pessoas reconcilia os nets e soma zero", () => {
    const net = { a: 6000, b: -4500, c: -1500 };
    const transfers = simplifyDebts(net);
    // cada transferência move de devedor para credor
    const sum = transfers.reduce((s, t) => s + t.amountCents, 0);
    expect(sum).toBe(6000); // total em dívida
    // reconstruir nets a partir das transferências
    const rebuilt: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (const t of transfers) {
      rebuilt[t.fromUserId]! -= t.amountCents;
      rebuilt[t.toUserId]! += t.amountCents;
    }
    expect(rebuilt).toEqual(net);
  });

  it("simplifyDebts: tudo saldado → sem transferências", () => {
    expect(simplifyDebts({ a: 0, b: 0 })).toEqual([]);
  });

  it("reembolso (valor negativo) não parte o saldo", () => {
    const e: Split = percentSplit({ [A]: 50, [B]: 50 });
    const { netByUser } = computeBalance({
      users,
      expenses: [
        expense({ amountCents: 10000, payerId: A }),
        expense({ amountCents: -4000, payerId: A, description: "Estorno", split: e }),
      ],
      settlements: [],
    });
    expect(netByUser[A]! + netByUser[B]!).toBe(0);
    // A pagou 100 e recebeu estorno de 40 → líquido 60, B deve 30
    expect(netByUser[A]).toBe(3000);
    expect(netByUser[B]).toBe(-3000);
  });
});
