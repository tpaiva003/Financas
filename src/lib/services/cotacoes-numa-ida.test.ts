/**
 * Saber a data e a moeda do que está guardado custa UMA ida, não duas.
 *
 * **O que isto protege.** Ler uma série de cotações fazia três idas à base de
 * dados por símbolo: a data da última (`latestQuoteDate`), os fechos
 * (`listQuotes`), e a moeda (`quoteCurrency`) — e as três em fila indiana. Numa
 * carteira de seis posições são dezoito viagens, metade delas a perguntar duas
 * vezes coisas que estão na mesma linha da mesma tabela. Medido no Património:
 * 29 idas à base de dados por visita, 18 delas estas.
 *
 * A data e a moeda passam a vir juntas (`latestQuoteHeader`), que é o que
 * sempre foram. Três idas passam a duas, em todos os ecrãs que mostram preços.
 *
 * **E corrige uma mentira pequena.** O `quoteCurrency` fazia `limit(1)` **sem
 * ordenar**: devolvia a moeda de uma linha ao acaso. Se a fonte tivesse mudado
 * de moeda a meio da série, o preço de hoje aparecia rotulado com a moeda de
 * há dois anos, e não havia nada no ecrã que o denunciasse. A moeda passa a ser
 * a da cotação mais recente — a mesma linha de onde sai o preço.
 *
 * É a terceira vez que esta app aprende isto na tabela das cotações. Daí o
 * teste contar viagens, e não resultados.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockRepository } from "@/lib/data/mock-repository";

const chamadas = { latestQuoteDate: 0, quoteCurrency: 0, latestQuoteHeader: 0 };

vi.mock("@/lib/data", async () => {
  const { MockRepository: M } = await import("@/lib/data/mock-repository");
  const repo = new M();
  for (const nome of ["latestQuoteDate", "quoteCurrency", "latestQuoteHeader"] as const) {
    const original = (repo[nome] as (...a: unknown[]) => unknown).bind(repo);
    (repo as unknown as Record<string, unknown>)[nome] = async (...args: unknown[]) => {
      chamadas[nome] += 1;
      return original(...args);
    };
  }
  return { getRepository: () => repo };
});

/** Sem rede: o que se conta são idas à base de dados, não à fonte. */
global.fetch = vi.fn(async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;

describe("ler uma série de cotações", () => {
  beforeEach(async () => {
    chamadas.latestQuoteDate = 0;
    chamadas.quoteCurrency = 0;
    chamadas.latestQuoteHeader = 0;
    const { getRepository } = await import("@/lib/data");
    const repo = getRepository() as unknown as MockRepository;
    await repo.saveQuotes(
      "tst.us",
      [
        { date: "2026-01-02", closeCents: 10_000 },
        { date: "2026-01-03", closeCents: 10_500 },
      ],
      "USD",
    );
  });

  it("pergunta a data e a moeda de uma vez só", async () => {
    const { getQuoteSeries } = await import("./quotes-service");
    await getQuoteSeries("tst.us");

    expect(chamadas.latestQuoteHeader).toBe(1);
    // As duas que isto substituiu não voltam a aparecer: cada uma delas é uma
    // viagem à rede por símbolo, em todos os ecrãs que mostram preços.
    expect(chamadas.latestQuoteDate).toBe(0);
    expect(chamadas.quoteCurrency).toBe(0);
  });

  it("devolve a moeda do que está guardado", async () => {
    const { getQuoteSeries } = await import("./quotes-service");
    const serie = await getQuoteSeries("tst.us");
    expect(serie.currency).toBe("USD");
    expect(serie.lastCloseCents).toBe(10_500);
  });

  it("um símbolo sem nada guardado não inventa moeda", async () => {
    const { getQuoteSeries } = await import("./quotes-service");
    const serie = await getQuoteSeries("nao-existe.us");
    // Euro é o que a app assume quando não sabe, e é o que sempre assumiu.
    expect(serie.currency).toBe("EUR");
    expect(serie.quotes).toEqual([]);
  });
});
