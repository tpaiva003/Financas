/**
 * Um rendimento partilhado: entra, e reparte-se pela mesma regra.
 *
 * Estes testes guardam as duas metades do pedido. A **conta** — a percentagem
 * acordada vale igual quando o dinheiro entra, e o saldo que sai daí é o certo
 * — e as **palavras**, porque foi o vocabulário que faltou: a conta já estava
 * feita e o ecrã continuava a chamar-lhe despesa.
 */

import { describe, expect, it } from "vitest";
import { ehEntrada, palavrasDoMontante } from "./entrada-partilhada";
import { computeShares, percentSplit } from "./split";
import { computeBalance } from "./balance";
import type { Expense } from "./types";

describe("o que conta como entrada", () => {
  it("um montante negativo é dinheiro que entra", () => {
    expect(ehEntrada(-1)).toBe(true);
    expect(ehEntrada(-10_000)).toBe(true);
  });

  it("zero e positivo não são", () => {
    expect(ehEntrada(0)).toBe(false);
    expect(ehEntrada(1)).toBe(false);
  });
});

describe("as palavras mudam com o sinal", () => {
  it("o que entra chama-se rendimento, e pergunta-se quem recebeu", () => {
    const p = palavrasDoMontante(-10_000);
    expect(p.substantivo).toBe("Rendimento");
    expect(p.quemMoveu).toBe("Quem recebeu");
    expect(p.guardar).toBe("Guardar rendimento");
    expect(p.verboDaQuota).toBe("recebe");
  });

  it("o que sai continua a ser despesa, e sem verbo na quota", () => {
    const p = palavrasDoMontante(10_000);
    expect(p.substantivo).toBe("Despesa");
    expect(p.quemMoveu).toBe("Quem pagou");
    expect(p.guardar).toBe("Guardar despesa");
    // A quota-parte é o que cada um suporta, não o que paga: quem pagou é
    // independente de como se divide, e ali não cabe verbo nenhum.
    expect(p.verboDaQuota).toBeNull();
  });
});

describe("a percentagem acordada vale igual quando o dinheiro entra", () => {
  it("reparte 100 € de rendimento a 70/30", () => {
    const shares = computeShares(-10_000, percentSplit({ a: 70, b: 30 }), ["a", "b"]);
    expect(shares).toEqual({ a: -7_000, b: -3_000 });
  });

  it("a soma das partes é exatamente o que entrou, mesmo com cêntimo a sobrar", () => {
    const shares = computeShares(-10_001, percentSplit({ a: 70, b: 30 }), ["a", "b"]);
    expect(shares.a! + shares.b!).toBe(-10_001);
  });
});

describe("o saldo depois de um rendimento partilhado", () => {
  /** O essencial de uma despesa; o resto não muda nada nestas contas. */
  function despesa(over: Partial<Expense>): Expense {
    return {
      id: "e1",
      spaceId: "s1",
      description: "Renda do quarto",
      amountCents: -10_000,
      currency: "EUR",
      transactionDate: "2026-09-01",
      categoryId: null,
      payerId: "a",
      kind: "shared",
      status: "confirmed",
      split: percentSplit({ a: 70, b: 30 }),
      origin: "manual",
      ...over,
    } as Expense;
  }

  it("quem recebeu fica a dever a parte do outro", () => {
    const { netByUser } = computeBalance({
      users: ["a", "b"],
      expenses: [despesa({})],
      settlements: [],
    });

    // A recebeu 100 €; 30 € eram do B. A deve 30, B tem 30 a receber.
    expect(netByUser.a).toBe(-3_000);
    expect(netByUser.b).toBe(3_000);
    expect(netByUser.a! + netByUser.b!).toBe(0);
  });

  it("um rendimento a 100% de quem o recebeu não mexe no saldo", () => {
    const { netByUser } = computeBalance({
      users: ["a", "b"],
      expenses: [despesa({ split: percentSplit({ a: 100, b: 0 }) })],
      settlements: [],
    });
    expect(netByUser.a).toBe(0);
    expect(netByUser.b).toBe(0);
  });
});
