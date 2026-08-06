import { describe, expect, it } from "vitest";
import {
  BENCHMARKS,
  benchmarkById,
  isStale,
  latestQuote,
  normalizeSymbol,
  parseStooqCsv,
  quotesToPrices,
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
    for (const b of BENCHMARKS) expect(b.symbols[0]!.endsWith(".de")).toBe(true);
  });

  it("têm alternativas, para um símbolo que muda não apagar a comparação", () => {
    for (const b of BENCHMARKS) expect(b.symbols.length).toBeGreaterThan(1);
  });

  it("os símbolos são todos válidos para a fonte", () => {
    for (const b of BENCHMARKS) {
      for (const s of b.symbols) expect(normalizeSymbol(s)).toBe(s);
    }
  });

  it("encontram-se por id", () => {
    expect(benchmarkById("sp500")!.label).toBe("S&P 500");
    expect(benchmarkById("world")!.label).toBe("MSCI World");
    expect(benchmarkById("nao-existe")).toBeNull();
  });
});
