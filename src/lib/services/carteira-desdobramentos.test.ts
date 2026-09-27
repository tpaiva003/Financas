/**
 * Os desdobramentos contam TAMBÉM na comparação com os índices.
 *
 * A lista de ativos e o detalhe já convertiam os movimentos para a unidade de
 * hoje; o `buildPortfolioReturn` lia-os em bruto. Uma compra anterior a um
 * 10:1 entrava com um décimo das unidades a multiplicar pelo preço por unidade
 * de hoje — a posição valia 10× a menos só nessa secção, sem aviso nenhum,
 * porque o detector de incoerências corre sobre os movimentos já convertidos.
 * Na carteira real havia três: Alphabet 20:1, NVIDIA 10:1 e um agrupamento
 * 1:5. Este teste falha contra essa versão.
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

describe("buildPortfolioReturn com um desdobramento registado", () => {
  it("a posição vale as unidades de HOJE, não as da compra pré-split", async () => {
    const ESPACO = `casa-splits-${(n += 1)}`;
    const { getRepository } = await import("@/lib/data");
    const repo = getRepository() as unknown as MockRepository;

    const bem = await repo.createAsset({
      spaceId: ESPACO,
      name: "Desdobrada 10:1",
      kind: "investimento",
      symbol: "zzz.us",
      quantity: null,
      // O preço de HOJE é por unidade nova (pós-split), como numa corretora.
      unitPriceCents: 130,
    });
    // 1 unidade a 10 €, antes do desdobramento.
    await repo.createAssetTrade({
      spaceId: ESPACO,
      assetId: bem.id,
      date: "2026-01-10",
      kind: "compra",
      quantity: 1,
      unitPriceCents: 1000,
      amountCents: 1000,
      notes: null,
    });
    await repo.createAssetSplit({
      spaceId: ESPACO,
      assetId: bem.id,
      date: "2026-02-01",
      ratio: 10,
    });

    const { buildPortfolioReturn } = await import("./portfolio-service");
    const r = (await buildPortfolioReturn(ESPACO))!;

    // 1 unidade antiga = 10 novas; 10 × 1,30 € = 13,00 €. Sem o desdobramento
    // aplicado, a conta dava 1 × 1,30 € = 1,30 € — dez vezes a menos.
    expect(r.currentValueCents).toBe(1300);
    // O dinheiro nunca muda com um desdobramento: o investido fica igual.
    expect(r.investedCents).toBe(1000);
  });
});
