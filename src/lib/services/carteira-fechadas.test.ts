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

/**
 * O cenário da carteira real que escondia as janelas: uma posição aberta com
 * cotações E uma fechada sem símbolo nenhum. A fechada entra na comparação
 * (os fluxos dela são exatos), mas não tem cotações — e a reconstrução
 * desistia de TODOS os dias por causa dela, quando nos períodos recentes ela
 * já estava fechada e valia zero sem precisar de cotação nenhuma.
 */
describe("as janelas com uma posição fechada sem cotações", () => {
  async function comAbertaEFechadaSemSimbolo() {
    const ESPACO = `casa-janelas-${(n += 1)}`;
    const { getRepository } = await import("@/lib/data");
    const repo = getRepository() as unknown as MockRepository;

    const aberta = await repo.createAsset({
      spaceId: ESPACO,
      name: "ETF com cotações",
      kind: "investimento",
      symbol: "vwce.de",
      quantity: 10,
      unitPriceCents: 130_00,
    });
    await repo.createAssetTrade({
      spaceId: ESPACO,
      assetId: aberta.id,
      date: "2025-08-01",
      kind: "compra",
      quantity: 10,
      unitPriceCents: 125_00,
      amountCents: 1_250_00,
      notes: null,
    });

    // Fechada há dez meses, sem símbolo: era esta a que apagava tudo.
    const fechada = await repo.createAsset({
      spaceId: ESPACO,
      name: "Vendida e sem símbolo",
      kind: "investimento",
      symbol: null,
      quantity: 0,
      unitPriceCents: null,
    });
    await repo.createAssetTrade({
      spaceId: ESPACO,
      assetId: fechada.id,
      date: "2025-08-05",
      kind: "compra",
      quantity: 5,
      unitPriceCents: 40_00,
      amountCents: 200_00,
      notes: null,
    });
    await repo.createAssetTrade({
      spaceId: ESPACO,
      assetId: fechada.id,
      date: "2025-10-01",
      kind: "venda",
      quantity: 5,
      unitPriceCents: 44_00,
      amountCents: 220_00,
      notes: null,
    });
    return ESPACO;
  }

  it("os períodos posteriores ao fecho medem-se na mesma", async () => {
    // O dia fixa-se porque as cotações do seed acabam a 2026-08-17: com o
    // relógio verdadeiro este teste apodrecia dez dias depois de escrito.
    vi.useFakeTimers({ now: new Date("2026-08-18T12:00:00Z"), toFake: ["Date"] });
    try {
      const espaco = await comAbertaEFechadaSemSimbolo();
      const { buildPortfolioReturn } = await import("./portfolio-service");

      const r = (await buildPortfolioReturn(espaco))!;
      const b = r.benchmarks[0]!;

      // As janelas curtas caem todas depois da venda: a fechada vale zero
      // nesses dias e não pode ser ela a apagá-las. (O 1d fica de fora do
      // teste: a 2026-08-18 recusa por as duas pontas caírem no mesmo fecho
      // de dia 17 — a recusa da segunda-feira, que é correta e é outra.)
      for (const id of ["7d", "15d", "1m", "3m", "6m"]) {
        const j = b.janelas.find((x) => x.id === id)!;
        expect(j.carteiraPct, `janela ${id}: ${j.motivo ?? ""}`).not.toBeNull();
      }

      // O ano inteiro apanha dias em que a fechada ainda estava aberta — e aí
      // não há mesmo como saber o valor dela. Recusar com motivo é o correto.
      expect(b.janelas.find((x) => x.id === "1a")!.motivo).not.toBeNull();

      // E a série mensal volta a existir nos meses depois do fecho.
      expect(b.serie.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
