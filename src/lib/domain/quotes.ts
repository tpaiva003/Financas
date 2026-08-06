/**
 * Cotações: leitura e escolha do índice de referência.
 *
 * **Os índices de referência são ETFs UCITS cotados em euros, não o índice em
 * dólares.** Parece um pormenor e não é. Um português não compra o S&P 500:
 * compra um ETF que o segue, em euros, e leva com o câmbio pelo caminho.
 * Comparar uma carteira em euros com o índice em dólares mede duas coisas ao
 * mesmo tempo, o mercado e o dólar, e nos anos em que o euro se mexe muito a
 * conclusão sai invertida. Usando o ETF em euros, a comparação é com o que se
 * podia mesmo ter comprado.
 *
 * A leitura do ficheiro de cotações é feita aqui, em funções puras, para poder
 * ser testada sem rede. Quem vai buscar os dados é o serviço.
 *
 * Lógica pura, sem acesso a dados.
 */

export interface Benchmark {
  id: string;
  label: string;
  /**
   * Símbolos a tentar, por ordem de preferência.
   *
   * São vários porque a fonte de cotações não garante nenhum em particular: os
   * códigos das praças mudam, um ETF deixa de ser seguido, um ticker é
   * renomeado. Com uma lista, a comparação continua a funcionar em vez de
   * desaparecer da página por causa de um símbolo. Os primeiros são ETFs UCITS
   * em euros; o último é o índice em dólares, que serve de rede de segurança e
   * mede o mercado com o câmbio à mistura, mas é melhor do que nada.
   */
  symbols: string[];
  /** O que é, em português corrente. */
  description: string;
}

/**
 * Os dois índices que interessam a quem investe a partir de Portugal: o
 * mercado americano e o mundo desenvolvido inteiro.
 */
export const BENCHMARKS: Benchmark[] = [
  {
    id: "sp500",
    label: "S&P 500",
    symbols: ["sxr8.de", "vusa.de", "^spx"],
    description: "As 500 maiores empresas americanas, pelo ETF da iShares em euros.",
  },
  {
    id: "world",
    label: "MSCI World",
    symbols: ["eunl.de", "iwda.uk", "urth.us"],
    description: "Mais de mil empresas dos mercados desenvolvidos, em euros.",
  },
];

export function benchmarkById(id: string): Benchmark | null {
  return BENCHMARKS.find((b) => b.id === id) ?? null;
}

export interface Quote {
  /** "AAAA-MM-DD". */
  date: string;
  /** Fecho, em cêntimos. */
  closeCents: number;
}

/**
 * Lê o CSV diário da Stooq.
 *
 * Formato: `Date,Open,High,Low,Close,Volume`, uma linha por dia de bolsa. Um
 * símbolo desconhecido devolve texto que não é CSV nenhum, e nesse caso o que
 * sai daqui é uma lista vazia, não uma exceção: quem chama trata a ausência de
 * cotações como ausência, que é o que ela é.
 */
export function parseStooqCsv(text: string): Quote[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = lines[0]!.toLowerCase().split(",");
  const dateCol = header.indexOf("date");
  const closeCol = header.indexOf("close");
  if (dateCol === -1 || closeCol === -1) return [];

  const quotes: Quote[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const date = (cells[dateCol] ?? "").trim();
    const close = Number((cells[closeCol] ?? "").trim());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!Number.isFinite(close) || close <= 0) continue;
    quotes.push({ date, closeCents: Math.round(close * 100) });
  }
  return quotes.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Cotações numa forma indexada por data, que é o que a simulação do índice pede. */
export function quotesToPrices(quotes: Quote[]): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const q of quotes) prices[q.date] = q.closeCents;
  return prices;
}

/** A cotação mais recente da série. */
export function latestQuote(quotes: Quote[]): Quote | null {
  if (quotes.length === 0) return null;
  return quotes.reduce((a, b) => (a.date >= b.date ? a : b));
}

/**
 * Um símbolo aceitável para a fonte de cotações.
 *
 * A Stooq usa sufixos de praça: `vwce.de` para a Xetra, `iwda.uk` para Londres,
 * `aapl.us` para os Estados Unidos. Sem sufixo assume-se o mercado americano,
 * que é o que confunde quem tem ETFs europeus.
 */
export function normalizeSymbol(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!/^[a-z0-9^._-]{1,20}$/.test(s)) return null;
  return s;
}

/**
 * Está desatualizada ao ponto de valer a pena ir buscar outra vez?
 *
 * As bolsas fecham a fins de semana e feriados, por isso "hoje não há cotação"
 * é normal e não é motivo para andar a bater na fonte. Dois dias de folga
 * cobrem o fim de semana sem deixar a página a mostrar preços velhos.
 */
export function isStale(lastDate: string | null, today: string, days = 2): boolean {
  if (!lastDate) return true;
  const diff =
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastDate}T00:00:00Z`)) / 86_400_000;
  return !Number.isFinite(diff) || diff > days;
}
