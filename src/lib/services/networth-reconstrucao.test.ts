/**
 * A reconstrução do histórico não pode ir à base de dados por cada investimento.
 *
 * **O que isto protege.** As cotações eram pedidas uma a uma, dentro de um ciclo
 * sobre os bens: com meia centena de investimentos, cinquenta viagens em fila
 * indiana — cada uma a trazer o histórico inteiro de um símbolo — **sempre que
 * alguém abria o resumo do património**. A página era lenta e ninguém percebia
 * porquê, porque acabava por abrir.
 *
 * É a segunda vez que esta app aprende isto na mesma tabela: o
 * `refreshStalePrices` já tinha passado de três consultas por símbolo para uma
 * só. O que faltava era um teste que contasse.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockRepository } from "@/lib/data/mock-repository";

const chamadas = { listQuotes: 0, listQuotesFor: 0 };

vi.mock("@/lib/data", async () => {
  const { MockRepository: M } = await import("@/lib/data/mock-repository");
  const repo = new M();
  const listQuotes = repo.listQuotes.bind(repo);
  const listQuotesFor = repo.listQuotesFor.bind(repo);
  // Contadas por fora, para o teste medir viagens e não resultados.
  repo.listQuotes = async (...args: Parameters<typeof listQuotes>) => {
    chamadas.listQuotes += 1;
    return listQuotes(...args);
  };
  repo.listQuotesFor = async (...args: Parameters<typeof listQuotesFor>) => {
    chamadas.listQuotesFor += 1;
    return listQuotesFor(...args);
  };
  return { getRepository: () => repo };
});

/** Sem rede nesta medição: o que se conta são idas à base de dados. */
global.fetch = vi.fn(async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;

let n = 0;

async function carteiraCom(quantos: number) {
  const ESPACO = `casa-reconstrucao-${(n += 1)}`;
  const { getRepository } = await import("@/lib/data");
  const repo = getRepository() as unknown as MockRepository;
  for (let i = 0; i < quantos; i++) {
    await repo.createAsset({
      spaceId: ESPACO,
      name: `Empresa ${i}`,
      kind: "investimento",
      symbol: `aaa${i}.us`,
      quantity: 10,
      // Preço de hoje: é o que faz o caminho das cotações ser percorrido.
      unitPriceCents: 1_000,
      unitCostCents: 800,
    });
  }
  return ESPACO;
}

describe("getNetWorthHistoryCompleto", () => {
  beforeEach(() => {
    chamadas.listQuotes = 0;
    chamadas.listQuotesFor = 0;
  });

  /**
   * O teste que falha contra o código antigo: lá eram trinta chamadas a
   * `listQuotes`, uma por investimento, todas em fila.
   */
  it("lê as cotações de toda a carteira numa consulta só", async () => {
    const espaco = await carteiraCom(30);
    const { getNetWorthHistoryCompleto } = await import("./networth-history-service");

    await getNetWorthHistoryCompleto(espaco, "2026-08-14");

    expect(chamadas.listQuotesFor).toBe(1);
    // Zero: a leitura um-a-um deixou de existir neste caminho.
    expect(chamadas.listQuotes).toBe(0);
  });

  it("uma carteira vazia não vai buscar cotações nenhumas", async () => {
    const { getNetWorthHistoryCompleto } = await import("./networth-history-service");

    await getNetWorthHistoryCompleto(`casa-vazia-${(n += 1)}`, "2026-08-14");

    expect(chamadas.listQuotes).toBe(0);
  });
});
