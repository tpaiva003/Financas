import { describe, expect, it, vi, afterEach } from "vitest";
import { probeQuoteSource } from "@/lib/services/quotes-service";

const CSV = `Date,Open,High,Low,Close,Volume
2026-08-05,52.75,53.10,52.60,53.05,110222`;

afterEach(() => vi.unstubAllGlobals());

describe("probeQuoteSource", () => {
  it("diz que funciona quando a fonte devolve cotações", async () => {
    vi.stubGlobal("fetch", async () => new Response(CSV, { status: 200 }));
    const [p] = await probeQuoteSource(["sxr8.de"]);
    expect(p!.verdict).toBe("ok");
    expect(p!.lastDate).toBe("2026-08-05");
  });

  it("distingue símbolo desconhecido de falta de rede", async () => {
    // A Stooq responde 200 com texto que não é CSV quando não conhece o símbolo.
    vi.stubGlobal("fetch", async () => new Response("No data", { status: 200 }));
    const [p] = await probeQuoteSource(["naoexiste.de"]);
    expect(p!.verdict).toBe("simbolo-desconhecido");
    expect(p!.httpStatus).toBe(200);
  });

  it("saída bloqueada é outra coisa, e diz-se outra coisa", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("CONNECT tunnel failed, response 403");
    });
    const [p] = await probeQuoteSource(["sxr8.de"]);
    expect(p!.verdict).toBe("sem-rede");
    expect(p!.httpStatus).toBeNull();
  });

  it("uma fonte em baixo não é culpa do símbolo", async () => {
    vi.stubGlobal("fetch", async () => new Response("erro", { status: 503 }));
    const [p] = await probeQuoteSource(["sxr8.de"]);
    expect(p!.verdict).toBe("resposta-estranha");
    expect(p!.httpStatus).toBe(503);
  });
});
