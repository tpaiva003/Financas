import { describe, expect, it, vi, afterEach } from "vitest";
import { probeQuoteSource } from "@/lib/services/quotes-service";

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
