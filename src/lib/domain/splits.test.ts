import { describe, expect, it } from "vitest";
import { buildPosition, type Trade } from "./positions";
import {
  aplicarSplits,
  detetarSplits,
  fatorDepoisDe,
  ratioPorExtenso,
  ratioValido,
  type AssetSplit,
} from "./splits";

function trade(p: Partial<Trade> & { id: string; date: string; kind: Trade["kind"] }): Trade {
  return {
    quantity: p.quantity ?? null,
    unitPriceCents: p.unitPriceCents ?? null,
    amountCents: p.amountCents ?? 0,
    ...p,
  };
}

const split = (p: Partial<AssetSplit> & { date: string; ratio: number }): AssetSplit => ({
  id: p.id ?? `sp-${p.date}`,
  assetId: p.assetId ?? "a1",
  date: p.date,
  ratio: p.ratio,
});

describe("fatorDepoisDe", () => {
  it("só contam os desdobramentos posteriores ao movimento", () => {
    const splits = [split({ date: "2022-07-18", ratio: 20 })];
    // Comprado antes: as unidades de então valem vinte hoje.
    expect(fatorDepoisDe(splits, "2021-01-04")).toBe(20);
    // Comprado depois: a corretora já registou as unidades novas.
    expect(fatorDepoisDe(splits, "2023-01-04")).toBe(1);
  });

  it("no próprio dia já vale a unidade nova", () => {
    // O movimento desse dia é registado pela corretora na unidade nova.
    expect(fatorDepoisDe([split({ date: "2022-07-18", ratio: 20 })], "2022-07-18")).toBe(1);
  });

  it("dois desdobramentos multiplicam-se", () => {
    const splits = [split({ date: "2020-08-31", ratio: 4 }), split({ date: "2024-06-10", ratio: 10 })];
    expect(fatorDepoisDe(splits, "2019-01-01")).toBe(40);
    expect(fatorDepoisDe(splits, "2022-01-01")).toBe(10);
  });

  it("um agrupamento reduz as unidades", () => {
    expect(fatorDepoisDe([split({ date: "2024-01-01", ratio: 0.1 })], "2023-01-01")).toBeCloseTo(0.1);
  });
});

describe("aplicarSplits", () => {
  const compra = trade({
    id: "c1",
    date: "2021-01-04",
    kind: "compra",
    quantity: 5,
    unitPriceCents: 200_000,
    amountCents: 1_000_000,
  });

  it("multiplica unidades, divide o preço, e não mexe no dinheiro", () => {
    const [t] = aplicarSplits([compra], [split({ date: "2022-07-18", ratio: 20 })]);
    expect(t!.quantity).toBe(100);
    expect(t!.unitPriceCents).toBe(10_000);
    // O ponto todo: nenhuma soma de euros desta app se altera.
    expect(t!.amountCents).toBe(1_000_000);
  });

  it("não toca no que veio depois", () => {
    const depois = trade({ id: "c2", date: "2023-01-04", kind: "compra", quantity: 3, amountCents: 30_000 });
    const [, t2] = aplicarSplits([compra, depois], [split({ date: "2022-07-18", ratio: 20 })]);
    expect(t2!.quantity).toBe(3);
  });

  it("sem desdobramentos devolve o que recebeu", () => {
    expect(aplicarSplits([compra], [])).toEqual([compra]);
  });

  /**
   * O caso que fazia a Google e a NVIDIA aparecerem como posições fechadas: a
   * corretora exportou a perna da venda e as unidades foram todas embora.
   */
  it("uma posição desdobrada não fica a zero", () => {
    const semSplit = buildPosition([compra]);
    const comSplit = buildPosition(aplicarSplits([compra], [split({ date: "2022-07-18", ratio: 20 })]));
    expect(semSplit.quantity).toBe(5);
    expect(comSplit.quantity).toBe(100);
    // O custo total é o mesmo dinheiro; o custo POR UNIDADE é que desce.
    expect(comSplit.costCents).toBe(semSplit.costCents);
    expect(comSplit.unitCostCents).toBe(10_000);
    expect(comSplit.investedCents).toBe(semSplit.investedCents);
  });
});

/**
 * A assinatura de um desdobramento por tratar: uma venda e uma compra no mesmo
 * dia, pelo mesmo dinheiro, com quantidades diferentes. Não sai nem entra um
 * cêntimo da conta.
 */
describe("detetarSplits", () => {
  const par = (): Trade[] => [
    trade({ id: "v", date: "2022-07-18", kind: "venda", quantity: 5, amountCents: 1_000_000 }),
    trade({ id: "c", date: "2022-07-18", kind: "compra", quantity: 100, amountCents: 1_000_000 }),
  ];

  it("apanha o par e calcula o fator", () => {
    const r = detetarSplits(par());
    expect(r).toHaveLength(1);
    expect(r[0]!.ratio).toBe(20);
    expect(r[0]!.vendaId).toBe("v");
    expect(r[0]!.compraId).toBe("c");
  });

  it("não apanha uma venda e uma compra em dias diferentes", () => {
    const t = par();
    t[1] = { ...t[1]!, date: "2022-07-19" };
    expect(detetarSplits(t)).toEqual([]);
  });

  /**
   * Se o dinheiro não bate, houve mesmo dinheiro a mexer-se — e transformar
   * isso num desdobramento apagava uma mais-valia real.
   */
  it("não apanha quando o dinheiro dos dois lados difere", () => {
    const t = par();
    t[1] = { ...t[1]!, amountCents: 1_200_000 };
    expect(detetarSplits(t)).toEqual([]);
  });

  it("aguenta um cêntimo de diferença por arredondamento", () => {
    const t = par();
    t[1] = { ...t[1]!, amountCents: 1_000_050 };
    expect(detetarSplits(t)).toHaveLength(1);
  });

  it("não apanha uma venda e uma recompra das mesmas unidades", () => {
    // Vender e voltar a comprar o mesmo no mesmo dia é uma operação real.
    const t = par();
    t[1] = { ...t[1]!, quantity: 5 };
    expect(detetarSplits(t)).toEqual([]);
  });

  it("um agrupamento também é apanhado", () => {
    const t = [
      trade({ id: "v", date: "2024-01-05", kind: "venda", quantity: 100, amountCents: 50_000 }),
      trade({ id: "c", date: "2024-01-05", kind: "compra", quantity: 10, amountCents: 50_000 }),
    ];
    expect(detetarSplits(t)[0]!.ratio).toBeCloseTo(0.1);
  });

  it("uma compra só serve um par", () => {
    const t = [
      ...par(),
      trade({ id: "v2", date: "2022-07-18", kind: "venda", quantity: 5, amountCents: 1_000_000 }),
    ];
    expect(detetarSplits(t)).toHaveLength(1);
  });
});

describe("ratioValido", () => {
  it("recusa o que não muda nada e o que é absurdo", () => {
    expect(ratioValido(1)).toBe(false);
    expect(ratioValido(0)).toBe(false);
    expect(ratioValido(-2)).toBe(false);
    expect(ratioValido(5000)).toBe(false);
    expect(ratioValido(Number.NaN)).toBe(false);
  });

  it("aceita desdobramentos e agrupamentos normais", () => {
    expect(ratioValido(20)).toBe(true);
    expect(ratioValido(0.1)).toBe(true);
    expect(ratioValido(1.5)).toBe(true);
  });
});

describe("ratioPorExtenso", () => {
  it("escreve-se como as bolsas escrevem", () => {
    expect(ratioPorExtenso(20)).toBe("20:1");
    expect(ratioPorExtenso(0.1)).toBe("1:10");
  });
});
