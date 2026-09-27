/**
 * Rentabilidade ponderada no tempo, a partir dos movimentos de um ativo.
 *
 * A TIR e a TWR respondem a perguntas diferentes e é fácil confundi-las. Estes
 * testes fixam a diferença com um caso onde ela é gritante: o mesmo investimento,
 * o mesmo desempenho, e um reforço grande mesmo antes de uma queda. A TIR afunda
 * (o meu dinheiro apanhou a queda) e a TWR não se mexe (o investimento fez o
 * mesmo que faria sem o reforço).
 */

import { describe, expect, it } from "vitest";
import { positionValuePoints, type Trade } from "./positions";
import { timeWeightedReturn, xirr } from "./returns";

/** Preços por unidade, em cêntimos de euro. */
const PRECOS: Record<string, number> = {
  "2025-01-01": 100_00,
  "2025-06-01": 200_00, // duplicou
  "2025-12-01": 100_00, // voltou ao início
};

describe("positionValuePoints", () => {
  it("uma compra e o dia de hoje dão dois pontos", () => {
    const trades: Trade[] = [
      { id: "a", date: "2025-01-01", kind: "compra", quantity: 10, amountCents: 100_000 },
    ];
    const pontos = positionValuePoints(trades, PRECOS, "2025-06-01", 200_000);
    // No primeiro dia não há troço anterior para fechar, por isso é um ponto só.
    expect(pontos).toEqual([
      { date: "2025-01-01", valueCents: 100_000, flowCents: 100_000 },
      { date: "2025-06-01", valueCents: 200_000, flowCents: 0 },
    ]);
  });

  it("junta num só ponto os movimentos do mesmo dia", () => {
    const trades: Trade[] = [
      { id: "a", date: "2025-01-01", kind: "compra", quantity: 10, amountCents: 100_000 },
      { id: "b", date: "2025-01-01", kind: "custo", quantity: null, amountCents: 500 },
    ];
    const pontos = positionValuePoints(trades, PRECOS, "2025-06-01", 200_000)!;
    expect(pontos).toHaveLength(2);
    expect(pontos[0]).toEqual({
      date: "2025-01-01",
      valueCents: 100_000,
      flowCents: 100_500,
    });
  });

  it("um dividendo é dinheiro que sai sem mexer na quantidade", () => {
    const trades: Trade[] = [
      { id: "a", date: "2025-01-01", kind: "compra", quantity: 10, amountCents: 100_000 },
      { id: "b", date: "2025-06-01", kind: "dividendo", quantity: null, amountCents: 5_000 },
    ];
    const pontos = positionValuePoints(trades, PRECOS, "2025-12-01", 100_000)!;
    // O dia do dividendo dá dois pontos: um a fechar o troço (10 unidades a
    // 200,00, sem fluxo) e outro a aplicar o dividendo, com a MESMA quantidade.
    expect(pontos[1]).toEqual({ date: "2025-06-01", valueCents: 200_000, flowCents: 0 });
    expect(pontos[2]).toEqual({ date: "2025-06-01", valueCents: 200_000, flowCents: -5_000 });
  });

  // A regra que este projeto repete: sem cotação não se inventa número nenhum.
  it("recusa quando falta a cotação de um dia", () => {
    const trades: Trade[] = [
      { id: "a", date: "2020-01-01", kind: "compra", quantity: 10, amountCents: 50_000 },
    ];
    expect(positionValuePoints(trades, PRECOS, "2025-06-01", 200_000)).toBeNull();
  });

  it("recusa sem movimentos", () => {
    expect(positionValuePoints([], PRECOS, "2025-06-01", 100)).toBeNull();
  });

  it("vender a mais não põe a posição a valer negativo", () => {
    const trades: Trade[] = [
      { id: "a", date: "2025-01-01", kind: "compra", quantity: 5, amountCents: 50_000 },
      { id: "b", date: "2025-06-01", kind: "venda", quantity: 20, amountCents: 400_000 },
    ];
    const pontos = positionValuePoints(trades, PRECOS, "2025-12-01", 0)!;
    expect(pontos.every((p) => p.valueCents >= 0)).toBe(true);
  });
});

describe("a TWR ignora o timing dos reforços e a TIR não", () => {
  /**
   * Comprou 10 a 100,00. Em junho, com o preço nos 200,00, reforçou pesado.
   * Em dezembro o preço voltou aos 100,00.
   */
  const COM_REFORCO: Trade[] = [
    { id: "a", date: "2025-01-01", kind: "compra", quantity: 10, amountCents: 100_000 },
    { id: "b", date: "2025-06-01", kind: "compra", quantity: 90, amountCents: 1_800_000 },
  ];

  /** O mesmo investimento sem o reforço: o desempenho é idêntico. */
  const SEM_REFORCO: Trade[] = [
    { id: "a", date: "2025-01-01", kind: "compra", quantity: 10, amountCents: 100_000 },
  ];

  const HOJE = "2025-12-01";

  it("a TWR é a mesma com e sem o reforço", () => {
    const comPontos = positionValuePoints(COM_REFORCO, PRECOS, HOJE, 100 * 100_00)!;
    const semPontos = positionValuePoints(SEM_REFORCO, PRECOS, HOJE, 10 * 100_00)!;

    const com = timeWeightedReturn(comPontos)!;
    const sem = timeWeightedReturn(semPontos)!;

    // Subiu 100% e voltou a cair 50%: zero, nos dois casos.
    expect(com).toBeCloseTo(0, 6);
    expect(sem).toBeCloseTo(0, 6);
    expect(com).toBeCloseTo(sem, 6);
  });

  it("a TIR afunda com o reforço feito no topo", () => {
    const com = xirr(
      [
        { date: "2025-01-01", amountCents: 100_000 },
        { date: "2025-06-01", amountCents: 1_800_000 },
      ],
      100 * 100_00,
      HOJE,
    )!;
    const sem = xirr([{ date: "2025-01-01", amountCents: 100_000 }], 10 * 100_00, HOJE)!;

    // Sem reforço o dinheiro está na mesma; com reforço perdeu-se metade dele.
    // A bissecção pára ao cêntimo, por isso 'zero' aqui é zero a duas casas.
    expect(sem).toBeCloseTo(0, 2);
    expect(com).toBeLessThan(-40);
  });
});

/**
 * Uma posição fechada, vendida a 0,1% do fecho do dia, dava **-100%** num
 * investimento que quase duplicou. De que lado do fecho caía a execução
 * decidia entre +100% e -100%.
 */
describe("uma posição vendida por inteiro", () => {
  const precos = { "2022-01-03": 10_00, "2024-01-03": 20_00 };

  function comVenda(precoDeVenda: number) {
    const trades: Trade[] = [
      { id: "1", date: "2022-01-03", kind: "compra", quantity: 100, amountCents: 1_000_00 },
      {
        id: "2",
        date: "2024-01-03",
        kind: "venda",
        quantity: 100,
        amountCents: Math.round(100 * precoDeVenda),
      },
    ];
    return positionValuePoints(trades, precos, "2024-01-03", 0);
  }

  it("não é castigada por ter sido executada um pouco abaixo do fecho", () => {
    const abaixo = timeWeightedReturn(comVenda(19_98)!);
    const exato = timeWeightedReturn(comVenda(20_00)!);
    const acima = timeWeightedReturn(comVenda(20_02)!);

    // Todas devem dizer a mesma coisa: o preço duplicou.
    expect(abaixo).toBeCloseTo(100, 0);
    expect(exato).toBeCloseTo(100, 0);
    expect(acima).toBeCloseTo(100, 0);
  });

  it("nunca devolve -100% para um investimento que ganhou", () => {
    for (const p of [19_50, 19_98, 20_00, 20_50]) {
      expect(timeWeightedReturn(comVenda(p)!)).toBeGreaterThan(0);
    }
  });
});

/**
 * O `positionValuePoints` prometia no cabeçalho recusar-se quando faltasse o
 * preço de algum dia, e não recusava: o `priceOn` arrastava o último fecho
 * indefinidamente. Uma série que acaba em 2022 avaliava um movimento de 2025 a
 * preços de 2022 e devolvia um número com ar de resposta.
 */
describe("uma série de cotações que acaba antes dos movimentos", () => {
  it("recusa-se em vez de arrastar um fecho de anos atrás", () => {
    const trades: Trade[] = [
      { id: "1", date: "2022-01-03", kind: "compra", quantity: 10, amountCents: 100_00 },
      { id: "2", date: "2025-06-02", kind: "compra", quantity: 5, amountCents: 50_00 },
    ];

    expect(positionValuePoints(trades, { "2022-01-03": 10_00 }, "2026-01-01", 200_00)).toBeNull();
  });

  it("mas aguenta um fim de semana ou um feriado", () => {
    const trades: Trade[] = [
      { id: "1", date: "2022-01-03", kind: "compra", quantity: 10, amountCents: 100_00 },
      { id: "2", date: "2022-01-10", kind: "compra", quantity: 5, amountCents: 55_00 },
    ];

    const pontos = positionValuePoints(
      trades,
      { "2022-01-03": 10_00, "2022-01-07": 11_00 },
      "2022-01-10",
      165_00,
    );
    expect(pontos).not.toBeNull();
  });
});
