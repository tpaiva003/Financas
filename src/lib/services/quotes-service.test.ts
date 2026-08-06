import { describe, expect, it, vi, afterEach } from "vitest";
import {
  getQuoteSeries,
  probeQuoteSource,
  refreshAssetPrice,
  refreshStalePrices,
} from "@/lib/services/quotes-service";
import { MockRepository } from "@/lib/data/mock-repository";

const CSV = `Date,Open,High,Low,Close,Volume
2026-08-05,52.75,53.10,52.60,53.05,110222`;

afterEach(() => vi.unstubAllGlobals());

const YAHOO = JSON.stringify({
  chart: {
    result: [
      {
        timestamp: [1785888000],
        indicators: { quote: [{ close: [53.05] }] },
      },
    ],
  },
});

const BLOQUEIO =
  '<!DOCTYPE html><html><head><meta charset="utf-8">' +
  '<meta name="robots" content="noindex,nofollow"></head><body><noscript>T</noscript>';

describe("probeQuoteSource", () => {
  it("testa cada fonte separadamente", async () => {
    vi.stubGlobal("fetch", async () => new Response(YAHOO, { status: 200 }));
    const probes = await probeQuoteSource(["sxr8.de"]);
    // Um símbolo, duas fontes.
    expect(probes).toHaveLength(2);
    expect(probes.map((p) => p.source).sort()).toEqual(["stooq", "yahoo"]);
  });

  it("diz que funciona quando a fonte devolve cotações", async () => {
    vi.stubGlobal("fetch", async () => new Response(YAHOO, { status: 200 }));
    const p = (await probeQuoteSource(["sxr8.de"])).find((x) => x.source === "yahoo");
    expect(p!.verdict).toBe("ok");
    expect(p!.lastDate).toBe("2026-08-05");
  });

  it("uma página de bloqueio com 200 não é um símbolo errado", async () => {
    // Foi este o engano em produção: a Stooq devolvia 200 com HTML e o
    // diagnóstico dizia que o símbolo estava errado, mandando corrigir o que
    // estava certo.
    vi.stubGlobal("fetch", async () => new Response(BLOQUEIO, { status: 200 }));
    const p = (await probeQuoteSource(["^spx"])).find((x) => x.source === "stooq");
    expect(p!.verdict).toBe("bloqueada");
    expect(p!.httpStatus).toBe(200);
  });

  it("distingue símbolo desconhecido de falta de rede", async () => {
    vi.stubGlobal("fetch", async () => new Response("No data", { status: 200 }));
    const p = (await probeQuoteSource(["naoexiste.de"])).find((x) => x.source === "stooq");
    expect(p!.verdict).toBe("simbolo-desconhecido");
    expect(p!.httpStatus).toBe(200);
  });

  it("saída bloqueada é outra coisa, e diz-se outra coisa", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("CONNECT tunnel failed, response 403");
    });
    const p = (await probeQuoteSource(["sxr8.de"]))[0];
    expect(p!.verdict).toBe("sem-rede");
    expect(p!.httpStatus).toBeNull();
  });

  it("uma fonte em baixo não é culpa do símbolo", async () => {
    vi.stubGlobal("fetch", async () => new Response("erro", { status: 503 }));
    const p = (await probeQuoteSource(["sxr8.de"]))[0];
    expect(p!.verdict).toBe("resposta-estranha");
    expect(p!.httpStatus).toBe(503);
  });

  it("diz o nome do símbolo em cada fonte, que nem sempre é o mesmo", async () => {
    vi.stubGlobal("fetch", async () => new Response(YAHOO, { status: 200 }));
    const probes = await probeQuoteSource(["iwda.uk"]);
    expect(probes.find((p) => p.source === "yahoo")!.querySymbol).toBe("IWDA.L");
    expect(probes.find((p) => p.source === "stooq")!.querySymbol).toBe("iwda.uk");
  });
});


describe("refreshStalePrices", () => {
  it("não grava uma cotação em dólares como se fossem euros", async () => {
    // Era este o erro: o MSFT vem a 536,92 USD e ficava gravado como 536,92 EUR,
    // inflacionando o património quase 10% sem dar sinal.
    const emDolares = JSON.stringify({
      chart: {
        result: [
          {
            meta: { currency: "USD" },
            timestamp: [1785888000],
            indicators: { quote: [{ close: [536.92] }] },
          },
        ],
      },
    });

    const repo = new MockRepository();
    const space = await repo.createSpace({ name: "Teste", createdBy: "u1", members: [] });
    const asset = await repo.createAsset({
      spaceId: space.id,
      name: "MSFT",
      kind: "investimento",
      quantity: 1,
      unitCostCents: null,
      unitPriceCents: null,
      valueCents: null,
      purchasedAt: null,
      notes: null,
      symbol: "msft.us",
    });

    // Sem taxa de câmbio disponível, não se grava preço nenhum.
    vi.stubGlobal("fetch", async (url: string) => {
      if (String(url).includes("frankfurter")) return new Response("erro", { status: 503 });
      return new Response(emDolares, { status: 200 });
    });

    const [freshness] = await refreshStalePrices(space.id);
    expect(freshness!.refreshed).toBe(false);
    expect(freshness!.problem).toContain("USD");

    const depois = (await repo.listAssets(space.id)).find((a) => a.id === asset.id);
    // O que interessa: NÃO ficou 53692.
    expect(depois!.unitPriceCents ?? null).toBeNull();
  });
});

describe("refreshAssetPrice", () => {
  /** Uma resposta do Yahoo com muitos dias, o último a 495,29 USD. */
  function serieLonga(): string {
    const dias = 2500;
    const timestamp: number[] = [];
    const close: number[] = [];
    // Termina em 2026-08-06, que é o dia da última cotação real do MSFT.
    const fim = Date.parse("2026-08-06T00:00:00Z") / 1000;
    for (let i = dias - 1; i >= 0; i--) {
      timestamp.push(fim - i * 86_400);
      close.push(i === 0 ? 495.29 : 202.02);
    }
    return JSON.stringify({
      chart: { result: [{ meta: { currency: "USD" }, timestamp, indicators: { quote: [{ close }] } }] },
    });
  }

  function stubFetch(serie: string, rate: number | null) {
    vi.stubGlobal("fetch", async (url: string) => {
      if (String(url).includes("frankfurter")) {
        if (rate === null) return new Response("erro", { status: 503 });
        return new Response(JSON.stringify({ date: "2026-08-06", rates: { USD: rate } }), {
          status: 200,
        });
      }
      return new Response(serie, { status: 200 });
    });
  }

  async function comAtivo() {
    const repo = new MockRepository();
    const space = await repo.createSpace({ name: "Teste", createdBy: "u1", members: [] });
    const asset = await repo.createAsset({
      spaceId: space.id,
      name: "MSFT",
      kind: "investimento",
      quantity: 1,
      unitCostCents: null,
      unitPriceCents: null,
      valueCents: null,
      purchasedAt: null,
      notes: null,
      symbol: "msft.us",
    });
    return { repo, space, asset };
  }

  it("converte para euros, tal como a atualização automática", async () => {
    // Este caminho ficou a gravar a cotação em bruto quando o outro passou a
    // converter: carregar em "Atualizar" gravava 495,29 € por um ativo que vale
    // 495,29 USD. O valor certo não pode depender de que botão se carregou.
    const { repo, space, asset } = await comAtivo();
    stubFetch(serieLonga(), 1.16);

    const r = await refreshAssetPrice(asset.id, space.id, "msft.us");
    expect(r.ok).toBe(true);
    expect(r.message).toContain("USD");

    const depois = (await repo.listAssets(space.id)).find((a) => a.id === asset.id);
    // 49529 / 1,16 = 42697 cêntimos, não 49529.
    expect(depois!.unitPriceCents).toBe(42697);
  });

  it("sem câmbio não grava nada, e diz porquê", async () => {
    const { repo, space, asset } = await comAtivo();
    stubFetch(serieLonga(), null);

    const r = await refreshAssetPrice(asset.id, space.id, "msft.us");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("USD");

    const depois = (await repo.listAssets(space.id)).find((a) => a.id === asset.id);
    expect(depois!.unitPriceCents ?? null).toBeNull();
  });

  it("apanha o fecho mais recente numa série longa, não um do meio", async () => {
    // O erro em produção: a leitura das cotações vinha cortada às mil linhas e a
    // "última" era a milésima mais antiga. Com dez anos de fechos diários, o
    // MSFT mostrava 28/07/2020 como se fosse hoje.
    stubFetch(serieLonga(), 1.16);
    const s = await getQuoteSeries("msft.us", { force: true, latestOnly: true });
    expect(s.lastDate).toBe("2026-08-06");
    expect(s.lastCloseCents).toBe(49529);
  });
});
