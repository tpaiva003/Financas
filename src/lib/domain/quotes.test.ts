import { describe, expect, it } from "vitest";
import {
  BENCHMARKS,
  benchmarkById,
  isStale,
  latestQuote,
  forSource,
  looksBlocked,
  normalizeSymbol,
  parseStooqCsv,
  parseYahooChart,
  quotesToPrices,
  symbolCandidates,
} from "./quotes";

const CSV = `Date,Open,High,Low,Close,Volume
2026-08-03,52.10,52.44,51.90,52.30,120345
2026-08-04,52.30,52.80,52.20,52.75,98765
2026-08-05,52.75,53.10,52.60,53.05,110222`;

describe("parseStooqCsv", () => {
  it("lê datas e fechos, em cêntimos", () => {
    const q = parseStooqCsv(CSV);
    expect(q).toHaveLength(3);
    expect(q[0]).toEqual({ date: "2026-08-03", closeCents: 5_230 });
    expect(q[2]).toEqual({ date: "2026-08-05", closeCents: 5_305 });
  });

  it("devolve ordenado por data, mesmo se o ficheiro vier ao contrário", () => {
    const invertido = [
      "Date,Open,High,Low,Close,Volume",
      "2026-08-05,52.75,53.10,52.60,53.05,1",
      "2026-08-03,52.10,52.44,51.90,52.30,1",
    ].join("\n");
    expect(parseStooqCsv(invertido).map((q) => q.date)).toEqual(["2026-08-03", "2026-08-05"]);
  });

  it("um símbolo desconhecido não rebenta, devolve vazio", () => {
    expect(parseStooqCsv("No data")).toEqual([]);
    expect(parseStooqCsv("<html><body>erro</body></html>")).toEqual([]);
    expect(parseStooqCsv("")).toEqual([]);
  });

  it("salta linhas estragadas em vez de inventar preços", () => {
    const sujo = [
      "Date,Open,High,Low,Close,Volume",
      "2026-08-03,52.10,52.44,51.90,52.30,1",
      "sem-data,1,1,1,1,1",
      "2026-08-04,52.30,52.80,52.20,N/D,1",
      "2026-08-05,52.75,53.10,52.60,0,1",
    ].join("\n");
    expect(parseStooqCsv(sujo)).toEqual([{ date: "2026-08-03", closeCents: 5_230 }]);
  });

  it("aguenta colunas por outra ordem", () => {
    const outra = ["Close,Date", "53.05,2026-08-05"].join("\n");
    expect(parseStooqCsv(outra)).toEqual([{ date: "2026-08-05", closeCents: 5_305 }]);
  });
});

describe("quotesToPrices", () => {
  it("indexa por data, como a simulação do índice precisa", () => {
    expect(quotesToPrices(parseStooqCsv(CSV))["2026-08-04"]).toBe(5_275);
  });
});

describe("latestQuote", () => {
  it("devolve a mais recente", () => {
    expect(latestQuote(parseStooqCsv(CSV))!.date).toBe("2026-08-05");
  });

  it("sem cotações, devolve nada", () => {
    expect(latestQuote([])).toBeNull();
  });
});

describe("normalizeSymbol", () => {
  it("aceita os sufixos de praça", () => {
    expect(normalizeSymbol(" VWCE.DE ")).toBe("vwce.de");
    expect(normalizeSymbol("^SPX")).toBe("^spx");
  });

  it("recusa lixo", () => {
    expect(normalizeSymbol("")).toBeNull();
    expect(normalizeSymbol("isto não é um símbolo")).toBeNull();
    expect(normalizeSymbol("a".repeat(30))).toBeNull();
  });
});

describe("isStale", () => {
  it("um fim de semana não conta como desatualizado", () => {
    // Sexta a sábado e a domingo: a bolsa esteve fechada.
    expect(isStale("2026-08-07", "2026-08-09")).toBe(false);
  });

  it("uma semana já é velho", () => {
    expect(isStale("2026-07-30", "2026-08-06")).toBe(true);
  });

  it("nunca buscadas conta como desatualizado", () => {
    expect(isStale(null, "2026-08-06")).toBe(true);
  });
});

describe("BENCHMARKS", () => {
  it("preferem um ETF em euros, não o índice em dólares", () => {
    // O sufixo .de é a Xetra, onde estes ETFs UCITS cotam em euros. É de
    // propósito: comparar euros com dólares mede o mercado e o câmbio à mistura.
    for (const b of BENCHMARKS) {
      expect(b.symbols[0]!.symbol.endsWith(".de")).toBe(true);
      expect(b.symbols[0]!.currency).toBe("EUR");
    }
  });

  it("têm alternativas, para um símbolo que muda não apagar a comparação", () => {
    for (const b of BENCHMARKS) expect(b.symbols.length).toBeGreaterThan(1);
  });

  it("os que cotam em euros vêm antes dos que cotam em dólares", () => {
    // Não é indiferente: um símbolo em dólares mede o mercado e o câmbio à
    // mistura. Serve de reserva, mas nunca à frente de um em euros.
    for (const b of BENCHMARKS) {
      const moedas = b.symbols.map((s) => s.currency);
      const ultimoEuro = moedas.lastIndexOf("EUR");
      const primeiroDolar = moedas.indexOf("USD");
      if (ultimoEuro !== -1 && primeiroDolar !== -1) {
        expect(ultimoEuro).toBeLessThan(primeiroDolar);
      }
    }
  });

  it("os símbolos são todos válidos para a fonte", () => {
    for (const b of BENCHMARKS) {
      for (const s of b.symbols) expect(normalizeSymbol(s.symbol)).toBe(s.symbol);
    }
  });

  it("encontram-se por id", () => {
    expect(benchmarkById("sp500")!.label).toBe("S&P 500");
    expect(benchmarkById("world")!.label).toBe("MSCI World");
    expect(benchmarkById("nao-existe")).toBeNull();
  });
});

describe("symbolCandidates", () => {
  it("um ticker sem sufixo tenta primeiro as praças explícitas", () => {
    // "MSFT" sem sufixo é ambíguo para a fonte, que indexa várias bolsas. As
    // formas explícitas vão à frente para não vir o instrumento errado.
    expect(symbolCandidates("MSFT")).toEqual(["msft.us", "msft.de", "msft"]);
  });

  it("um símbolo com sufixo é usado tal e qual", () => {
    expect(symbolCandidates("sxr8.de")).toEqual(["sxr8.de"]);
    expect(symbolCandidates("iwda.uk")).toEqual(["iwda.uk"]);
  });

  it("um índice não leva sufixo nenhum", () => {
    expect(symbolCandidates("^spx")).toEqual(["^spx"]);
  });

  it("lixo não gera candidatos", () => {
    expect(symbolCandidates("")).toEqual([]);
    expect(symbolCandidates("isto não é um símbolo")).toEqual([]);
  });
});

describe("looksBlocked", () => {
  it("reconhece a página de bloqueio que a Stooq devolve com HTTP 200", () => {
    // Foi isto que se passou em produção: 200, tempo normal, e HTML em vez de
    // dados, igual para todos os símbolos. Chamar-lhe "símbolo desconhecido"
    // mandava-nos corrigir o que estava certo.
    const bloqueio =
      '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<meta name="robots" content="noindex,nofollow"></head><body><noscript>T</noscript>';
    expect(looksBlocked(bloqueio)).toBe(true);
  });

  it("CSV a sério não é bloqueio", () => {
    expect(looksBlocked(CSV)).toBe(false);
  });

  it("JSON a sério não é bloqueio", () => {
    expect(looksBlocked('{"chart":{"result":[]}}')).toBe(false);
  });

  it("texto curto de erro não é bloqueio", () => {
    expect(looksBlocked("No data")).toBe(false);
  });
});

describe("parseYahooChart", () => {
  const YAHOO = JSON.stringify({
    chart: {
      result: [
        {
          timestamp: [1785715200, 1785801600, 1785888000],
          indicators: { quote: [{ close: [52.3, null, 53.05] }] },
        },
      ],
      error: null,
    },
  });

  it("lê os fechos, em cêntimos, com a data do dia", () => {
    const q = parseYahooChart(YAHOO);
    expect(q).toHaveLength(2);
    expect(q[0]).toEqual({ date: "2026-08-03", closeCents: 5_230 });
    expect(q[1]).toEqual({ date: "2026-08-05", closeCents: 5_305 });
  });

  it("salta os dias sem fecho em vez de os contar como zero", () => {
    expect(parseYahooChart(YAHOO).some((q) => q.closeCents === 0)).toBe(false);
  });

  it("uma resposta que não é JSON não rebenta", () => {
    expect(parseYahooChart("<!DOCTYPE html>")).toEqual([]);
    expect(parseYahooChart("")).toEqual([]);
  });

  it("um símbolo desconhecido devolve vazio", () => {
    expect(parseYahooChart('{"chart":{"result":null,"error":{"code":"Not Found"}}}')).toEqual([]);
  });
});

describe("forSource", () => {
  it("traduz as convenções de praça entre fontes", () => {
    // Londres é .uk numa e .L na outra; o S&P 500 tem nomes diferentes.
    expect(forSource("iwda.uk", "yahoo")).toBe("IWDA.L");
    expect(forSource("^spx", "yahoo")).toBe("^GSPC");
    expect(forSource("msft.us", "yahoo")).toBe("MSFT");
    expect(forSource("sxr8.de", "yahoo")).toBe("SXR8.DE");
  });

  it("para a Stooq fica como está, que é a forma nativa", () => {
    expect(forSource("iwda.uk", "stooq")).toBe("iwda.uk");
    expect(forSource("^spx", "stooq")).toBe("^spx");
  });
});
