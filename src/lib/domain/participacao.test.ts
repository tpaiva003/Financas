/**
 * Acrescentar alguém não pode reescrever o passado.
 *
 * O saldo dividia cada despesa pela lista de membros ATUAL. Como a despesa não
 * guardava quem tinha participado nela, acrescentar uma terceira pessoa fazia-a
 * dever a sua parte de jantares em que não esteve, e invertia o saldo de quem lá
 * estava — sem que ninguém tivesse tocado numa despesa. O saldo deixava de ser
 * explicável, que é o único invariante que este cálculo tem de defender.
 */

import { describe, expect, it } from "vitest";
import { computeBalance } from "./balance";
import { equalSplit, percentSplit } from "./split";
import type { Expense, Settlement } from "./types";

const TIAGO = "tiago";
const CLARA = "clara";
const RUI = "rui";

let seq = 0;
function despesa(p: {
  amountCents: number;
  payerId: string;
  transactionDate: string;
  split?: Expense["split"];
}): Expense {
  seq += 1;
  return {
    id: `e${seq}`,
    uid: `uid${seq}`,
    description: "Jantar",
    currency: "EUR",
    transactionDate: p.transactionDate,
    kind: "shared",
    split: p.split ?? equalSplit(),
    origin: "manual",
    status: "confirmed",
    amountCents: p.amountCents,
    payerId: p.payerId,
    ownerId: p.payerId,
    createdBy: p.payerId,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
  };
}

/** Duas despesas de janeiro, antes de o Rui entrar. */
const JANEIRO: Expense[] = [
  despesa({ amountCents: 100_00, payerId: TIAGO, transactionDate: "2026-01-10" }),
  despesa({ amountCents: 60_00, payerId: CLARA, transactionDate: "2026-01-20" }),
];

const SEM_ACERTOS: Settlement[] = [];

describe("uma pessoa que entra a meio", () => {
  it("com dois, o saldo é o esperado", () => {
    const r = computeBalance({
      users: [TIAGO, CLARA],
      expenses: JANEIRO,
      settlements: SEM_ACERTOS,
    });
    expect(r.netByUser[TIAGO]).toBe(20_00);
    expect(r.netByUser[CLARA]).toBe(-20_00);
  });

  it("entrando 'de agora em diante', não toca no que já lá estava", () => {
    const r = computeBalance({
      users: [TIAGO, CLARA, RUI],
      expenses: JANEIRO,
      settlements: SEM_ACERTOS,
      participatesFrom: { [TIAGO]: null, [CLARA]: null, [RUI]: "2026-02-01" },
    });
    expect(r.netByUser[TIAGO]).toBe(20_00);
    expect(r.netByUser[CLARA]).toBe(-20_00);
    // O Rui não deve nada de um jantar em que não esteve.
    expect(r.netByUser[RUI]).toBe(0);
  });

  it("entrando 'a partir de uma data', divide só o que vem depois dela", () => {
    const expenses = [
      ...JANEIRO,
      despesa({ amountCents: 90_00, payerId: TIAGO, transactionDate: "2026-03-15" }),
    ];
    const r = computeBalance({
      users: [TIAGO, CLARA, RUI],
      expenses,
      settlements: SEM_ACERTOS,
      participatesFrom: { [TIAGO]: null, [CLARA]: null, [RUI]: "2026-03-01" },
    });
    // Janeiro continua a dois; março divide-se a três (30,00 cada).
    expect(r.netByUser[RUI]).toBe(-30_00);
    expect(r.netByUser[TIAGO]).toBe(20_00 + 60_00);
    expect(r.netByUser[CLARA]).toBe(-20_00 - 30_00);
  });

  it("entrando 'tudo', divide também o histórico, mas só se for pedido", () => {
    const r = computeBalance({
      users: [TIAGO, CLARA, RUI],
      expenses: JANEIRO,
      settlements: SEM_ACERTOS,
      participatesFrom: { [TIAGO]: null, [CLARA]: null, [RUI]: null },
    });
    expect(r.netByUser[RUI]).toBe(-53_33);
  });

  it("uma divisão por percentagem não é afetada por quem entra", () => {
    const expenses = [
      despesa({
        amountCents: 100_00,
        payerId: TIAGO,
        transactionDate: "2026-01-10",
        split: percentSplit({ [TIAGO]: 70, [CLARA]: 30 }),
      }),
    ];
    const semRui = computeBalance({
      users: [TIAGO, CLARA],
      expenses,
      settlements: SEM_ACERTOS,
    });
    const comRui = computeBalance({
      users: [TIAGO, CLARA, RUI],
      expenses,
      settlements: SEM_ACERTOS,
      participatesFrom: { [TIAGO]: null, [CLARA]: null, [RUI]: null },
    });
    // Os pesos já dizem quem suporta o quê: entrar mais gente não muda nada.
    expect(comRui.netByUser[TIAGO]).toBe(semRui.netByUser[TIAGO]);
    expect(comRui.netByUser[CLARA]).toBe(semRui.netByUser[CLARA]);
    expect(comRui.netByUser[RUI]).toBe(0);
  });
});

describe("o saldo soma sempre zero", () => {
  it("mesmo com quem pagou fora da lista de membros", () => {
    // Não devia acontecer (as escritas travam-no), mas quando acontecia o
    // crédito de quem pagou era descartado e as quotas continuavam a ser
    // debitadas: as duas pessoas apareciam a dever dinheiro a ninguém.
    const r = computeBalance({
      users: [TIAGO, CLARA],
      expenses: [despesa({ amountCents: 100_00, payerId: RUI, transactionDate: "2026-01-10" })],
      settlements: SEM_ACERTOS,
    });
    const soma = Object.values(r.netByUser).reduce((a, b) => a + b, 0);
    expect(soma).toBe(0);
    expect(r.netByUser[RUI]).toBe(100_00);
  });

  it("com participação parcial e acertos pelo meio", () => {
    const expenses = [
      ...JANEIRO,
      despesa({ amountCents: 90_00, payerId: RUI, transactionDate: "2026-04-01" }),
    ];
    const settlements: Settlement[] = [
      {
        id: "s1",
        fromUserId: CLARA,
        toUserId: TIAGO,
        amountCents: 20_00,
        currency: "EUR",
        date: "2026-02-01",
        note: null,
        createdBy: CLARA,
        createdAt: "2026-02-01T00:00:00Z",
      },
    ];
    const r = computeBalance({
      users: [TIAGO, CLARA, RUI],
      expenses,
      settlements,
      participatesFrom: { [TIAGO]: null, [CLARA]: null, [RUI]: "2026-03-01" },
    });
    const soma = Object.values(r.netByUser).reduce((a, b) => a + b, 0);
    expect(soma).toBe(0);
  });
});
