import { describe, expect, it } from "vitest";
import { assinatura, movimentosNovos, type MovimentoComparavel } from "./trades-dedup";

const m = (p: Partial<MovimentoComparavel> = {}): MovimentoComparavel => ({
  date: "2025-03-10",
  kind: "compra",
  quantity: 5,
  amountCents: 50_000,
  ...p,
});

describe("movimentosNovos", () => {
  it("uma primeira importação entra toda", () => {
    const r = movimentosNovos([], [m(), m({ date: "2025-04-10" })]);
    expect(r.novos).toHaveLength(2);
    expect(r.repetidos).toBe(0);
  });

  /**
   * O gesto natural: descarregar outra vez o ficheiro da corretora para
   * apanhar o que há de novo. Sem isto, duplicava a carteira inteira — o dobro
   * das unidades, o dobro do investido, e uma posição que não existe.
   */
  it("reimportar o mesmo ficheiro não acrescenta nada", () => {
    const ficheiro = [m(), m({ date: "2025-04-10" })];
    const r = movimentosNovos(ficheiro, ficheiro);
    expect(r.novos).toEqual([]);
    expect(r.repetidos).toBe(2);
  });

  it("de um ficheiro maior entra só o que falta", () => {
    const jaLa = [m()];
    const ficheiro = [m(), m({ date: "2025-04-10" }), m({ date: "2025-05-10" })];
    const r = movimentosNovos(jaLa, ficheiro);
    expect(r.novos.map((x) => x.date)).toEqual(["2025-04-10", "2025-05-10"]);
    expect(r.repetidos).toBe(1);
  });

  /**
   * A metade difícil do invariante. Uma ordem grande executa em várias parcelas
   * e a corretora exporta uma linha por parcela. Uma chave que as juntasse
   * fazia desaparecer metade do dinheiro, calada.
   */
  it("duas compras iguais no mesmo dia são duas compras", () => {
    const r = movimentosNovos([], [m(), m()]);
    expect(r.novos).toHaveLength(2);
  });

  it("com uma das duas já registada, entra só a outra", () => {
    const r = movimentosNovos([m()], [m(), m()]);
    expect(r.novos).toHaveLength(1);
    expect(r.repetidos).toBe(1);
  });

  it("mais registadas do que o ficheiro traz não inventa nada", () => {
    const r = movimentosNovos([m(), m()], [m()]);
    expect(r.novos).toEqual([]);
    expect(r.repetidos).toBe(1);
  });

  it("um cêntimo de diferença é outro movimento", () => {
    const r = movimentosNovos([m()], [m({ amountCents: 50_001 })]);
    expect(r.novos).toHaveLength(1);
  });

  it("uma venda não se confunde com uma compra do mesmo valor", () => {
    const r = movimentosNovos([m()], [m({ kind: "venda" })]);
    expect(r.novos).toHaveLength(1);
  });

  it("uma quantidade diferente é outro movimento", () => {
    const r = movimentosNovos([m()], [m({ quantity: 6 })]);
    expect(r.novos).toHaveLength(1);
  });

  it("um dividendo sem unidades compara-se na mesma", () => {
    const div = m({ kind: "dividendo", quantity: null, amountCents: 1_200 });
    expect(movimentosNovos([div], [div]).novos).toEqual([]);
  });
});

describe("assinatura", () => {
  it("uma fração de ETF não muda por um bit no fim", () => {
    // 0.1 + 0.2 não é exactamente 0.3 em vírgula flutuante, e duas leituras do
    // mesmo número não podem dar movimentos diferentes.
    expect(assinatura(m({ quantity: 0.1 + 0.2 }))).toBe(assinatura(m({ quantity: 0.3 })));
  });
});
