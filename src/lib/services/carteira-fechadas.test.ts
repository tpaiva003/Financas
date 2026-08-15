/**
 * Uma posição fechada conta — na taxa, na comparação e no resultado.
 *
 * **O que isto protege, e foi apanhado pelo Tiago a olhar para o ecrã.** A
 * rentabilidade da carteira mostrava "dinheiro que entrou" com todas as compras
 * — incluindo as de posições já vendidas — e "vale hoje" só com o que ainda
 * está em carteira. O dinheiro que voltou das vendas não aparecia em lado
 * nenhum, e o ganho aparente ficava mais pequeno do que o real por tudo o que
 * passou por posições fechadas.
 *
 * E a correção anterior, que tirava da comparação as posições sem preço atual,
 * tinha um engano por baixo: olhava para o preço e não para a posição. **Uma
 * posição fechada não precisa de preço** — já não há unidades, o valor de hoje
 * é zero e não "desconhecido", e o que lhe aconteceu está inteiro nos
 * movimentos. Na carteira real, as oito "sem preço atual" eram **todas**
 * fechadas: a correção excluía exatamente aquelas de que mais se sabe.
 */

import { describe, expect, it, vi } from "vitest";
import type { MockRepository } from "@/lib/data/mock-repository";

vi.mock("@/lib/data", async () => {
  const { MockRepository: M } = await import("@/lib/data/mock-repository");
  const repo = new M();
  return { getRepository: () => repo };
});

/** Sem rede: o que se mede aqui são as contas, não as cotações. */
global.fetch = vi.fn(async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;

let n = 0;

/**
 * Uma posição comprada e vendida por inteiro, **sem preço atual gravado** —
 * como acontece a tudo o que sai de carteira e deixa de ser cotado.
 */
async function comUmaFechada() {
  const ESPACO = `casa-fechadas-${(n += 1)}`;
  const { getRepository } = await import("@/lib/data");
  const repo = getRepository() as unknown as MockRepository;

  const bem = await repo.createAsset({
    spaceId: ESPACO,
    name: "Vendida por inteiro",
    kind: "investimento",
    symbol: "zzz.us",
    quantity: 0,
    unitPriceCents: null,
  });
  await repo.createAssetTrade({
    spaceId: ESPACO,
    assetId: bem.id,
    date: "2026-01-10",
    kind: "compra",
    quantity: 10,
    unitPriceCents: 100_00,
    amountCents: 1_000_00,
    notes: null,
  });
  await repo.createAssetTrade({
    spaceId: ESPACO,
    assetId: bem.id,
    date: "2026-05-10",
    kind: "venda",
    quantity: 10,
    unitPriceCents: 150_00,
    amountCents: 1_500_00,
    notes: null,
  });
  return ESPACO;
}

describe("buildPortfolioReturn", () => {
  it("conta o dinheiro que voltou e o resultado já garantido", async () => {
    const espaco = await comUmaFechada();
    const { buildPortfolioReturn } = await import("./portfolio-service");

    const r = (await buildPortfolioReturn(espaco))!;

    expect(r.investedCents).toBe(1_000_00);
    expect(r.proceedsCents).toBe(1_500_00);
    // Vendeu-se por 1500 o que custou 1000: quinhentos já garantidos.
    expect(r.realizedGainCents).toBe(500_00);
  });

  /**
   * O teste que falha contra a versão anterior: lá, uma fechada sem preço
   * entrava em `missingPrice` e o ecrã dizia que o valor de hoje estava por
   * baixo do real. Não estava — o valor dela é mesmo zero.
   */
  it("uma posição fechada não é uma posição sem preço", async () => {
    const espaco = await comUmaFechada();
    const { buildPortfolioReturn } = await import("./portfolio-service");

    const r = (await buildPortfolioReturn(espaco))!;

    expect(r.missingPrice).toBe(0);
    expect(r.semPreco).toEqual([]);
    // E o dinheiro dela não fica de fora da comparação: sabe-se tudo sobre ela.
    expect(r.foraDaComparacaoCents).toBe(0);
  });

  it("o valor de hoje de uma carteira só com fechadas é zero, e não o custo", async () => {
    const espaco = await comUmaFechada();
    const { buildPortfolioReturn } = await import("./portfolio-service");

    const r = (await buildPortfolioReturn(espaco))!;

    expect(r.currentValueCents).toBe(0);
  });
});
