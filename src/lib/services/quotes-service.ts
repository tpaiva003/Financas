/**
 * Ir buscar cotações e guardá-las.
 *
 * Fontes: Yahoo Finance primeiro, Stooq a seguir. Nenhuma pede chave.
 *
 * São duas de propósito. A Stooq era a única e passou a responder a pedidos de
 * servidores com uma página anti-robô: HTTP 200, HTML em vez de dados, igual
 * para todos os símbolos. Uma fonte gratuita pode fazer isso de um dia para o
 * outro, e sem alternativa a funcionalidade morre com ela.
 *
 * O que se busca fica guardado. Isso serve três coisas: a página desenha-se
 * sem depender de uma chamada externa, a fonte não leva com um pedido por
 * visita, e sobretudo a **comparação com o índice precisa do histórico**, não
 * do preço de hoje. Sem as cotações das datas dos reforços não há forma de
 * simular o que teria acontecido se o mesmo dinheiro tivesse ido para o índice.
 *
 * Nada aqui deita a app abaixo. Se a fonte falhar, mostra-se a última cotação
 * que se sabe, com a data, e diz-se que não se conseguiu atualizar. Um preço
 * velho identificado como velho é informação; um preço inventado não é.
 */

import { getRepository } from "@/lib/data";
import type { StoredQuote } from "@/lib/data";
import {
  QUOTE_SOURCES,
  forSource,
  isStale,
  looksBlocked,
  normalizeSymbol,
  parseStooqCsv,
  parseYahooChart,
  symbolCandidates,
  type Quote,
  type QuoteSourceId,
} from "@/lib/domain";

const TIMEOUT_MS = 10_000;

export interface QuoteSeries {
  symbol: string;
  quotes: StoredQuote[];
  /** A cotação mais recente que temos. */
  lastDate: string | null;
  lastCloseCents: number | null;
  /** Foi buscar dados novos nesta chamada. */
  refreshed: boolean;
  /** Porque é que não foi possível atualizar, se for o caso. */
  problem: string | null;
}

function sourceUrl(source: QuoteSourceId, symbol: string, from?: string | null): string {
  const s = encodeURIComponent(forSource(symbol, source));
  if (source === "yahoo") {
    // Um intervalo generoso: o histórico serve a comparação com o índice, que
    // precisa das cotações das datas dos reforços, não só do preço de hoje.
    const range = from ? "1y" : "10y";
    return `https://query1.finance.yahoo.com/v8/finance/chart/${s}?interval=1d&range=${range}`;
  }
  const params = new URLSearchParams({ s: forSource(symbol, source), i: "d" });
  if (from) params.set("d1", from.replaceAll("-", ""));
  return `https://stooq.com/q/d/l/?${params}`;
}

function parseFor(source: QuoteSourceId, text: string): Quote[] {
  return source === "yahoo" ? parseYahooChart(text) : parseStooqCsv(text);
}

/** Uma tentativa numa fonte, com o motivo quando não dá. */
interface Attempt {
  quotes: Quote[];
  blocked: boolean;
}

async function fetchFrom(
  source: QuoteSourceId,
  symbol: string,
  from?: string | null,
): Promise<Attempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(sourceUrl(source, symbol, from), {
      signal: controller.signal,
      headers: {
        accept: source === "yahoo" ? "application/json" : "text/csv,text/plain",
        // Sem isto, algumas fontes respondem com uma página de bloqueio a
        // pedidos que não parecem vir de um browser.
        "user-agent": "Mozilla/5.0 (compatible; Rachar/1.0; +https://rachar.pt)",
      },
      next: { revalidate: 3_600 },
    });
    if (!res.ok) return { quotes: [], blocked: false };
    const text = await res.text();
    if (looksBlocked(text)) return { quotes: [], blocked: true };
    return { quotes: parseFor(source, text), blocked: false };
  } catch {
    return { quotes: [], blocked: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Vai buscar cotações, pela ordem das fontes.
 *
 * A primeira que devolver dados ganha. Ter mais do que uma não é excesso de
 * zelo: a Stooq, que era a única, passou a responder com uma página anti-robô a
 * pedidos de servidores, e a funcionalidade morreu com ela.
 */
async function fetchFromSource(symbol: string, from?: string | null): Promise<StoredQuote[]> {
  for (const source of QUOTE_SOURCES) {
    const attempt = await fetchFrom(source, symbol, from);
    if (attempt.quotes.length > 0) return attempt.quotes;
  }
  return [];
}

/**
 * A série de um símbolo, atualizada se estiver velha.
 *
 * `since` limita o que se lê da base de dados: para a comparação com o índice
 * basta desde o primeiro reforço, não desde sempre.
 */
export async function getQuoteSeries(
  rawSymbol: string,
  options: { since?: string | null; force?: boolean } = {},
): Promise<QuoteSeries> {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) {
    return {
      symbol: rawSymbol,
      quotes: [],
      lastDate: null,
      lastCloseCents: null,
      refreshed: false,
      problem: "Símbolo inválido.",
    };
  }

  const repo = getRepository();
  const today = new Date().toISOString().slice(0, 10);

  let lastDate: string | null = null;
  try {
    lastDate = await repo.latestQuoteDate(symbol);
  } catch {
    // Tabela ainda não existe (migração 0017 por correr): segue-se sem cache.
  }

  let refreshed = false;
  let problem: string | null = null;

  if (options.force || isStale(lastDate, today)) {
    // Pede-se só o que falta. Da primeira vez não há nada, e vem tudo.
    const fetched = await fetchFromSource(symbol, lastDate);
    if (fetched.length === 0) {
      problem = lastDate
        ? "Não consegui atualizar as cotações agora."
        : "Não encontrei cotações para este símbolo.";
    } else {
      try {
        await repo.saveQuotes(symbol, fetched);
        refreshed = true;
      } catch {
        problem = "Fui buscar as cotações mas não as consegui guardar.";
      }
    }
  }

  let quotes: StoredQuote[] = [];
  try {
    quotes = await repo.listQuotes(symbol, options.since ?? undefined);
  } catch {
    problem = problem ?? "Não consegui ler as cotações guardadas.";
  }

  const last = quotes.length > 0 ? quotes[quotes.length - 1]! : null;
  return {
    symbol,
    quotes,
    lastDate: last?.date ?? null,
    lastCloseCents: last?.closeCents ?? null,
    refreshed,
    problem,
  };
}

export type QuoteVerdict =
  | "ok"
  | "sem-rede"
  | "bloqueada"
  | "simbolo-desconhecido"
  | "resposta-estranha";

export interface QuoteProbe {
  symbol: string;
  source: QuoteSourceId;
  /** O nome do símbolo nessa fonte, que nem sempre é o mesmo. */
  querySymbol: string;
  verdict: QuoteVerdict;
  /** O que dizer a quem está a olhar, em português. */
  message: string;
  httpStatus: number | null;
  /** Início da resposta, que costuma dizer tudo. */
  firstLine: string | null;
  quotes: number;
  lastDate: string | null;
  ms: number;
}

/**
 * Testa as fontes de cotações e diz **porquê** quando não funcionam.
 *
 * Existe porque "não encontrei cotações para este símbolo" é uma mensagem
 * honesta e inútil. E há um caso que engana: uma fonte pode recusar um servidor
 * devolvendo **HTTP 200 com uma página de bloqueio**, o que se lê como "símbolo
 * desconhecido" e manda corrigir o que estava certo. Aconteceu, e é por isso
 * que `bloqueada` é um veredicto próprio.
 *
 * Testa cada fonte separadamente: saber que uma falha e a outra serve é a
 * diferença entre resolver e adivinhar.
 */
export async function probeQuoteSource(symbols: string[]): Promise<QuoteProbe[]> {
  const jobs = symbols.flatMap((raw) =>
    QUOTE_SOURCES.map((source) => ({ raw, source })),
  );

  return Promise.all(
    jobs.map(async ({ raw, source }): Promise<QuoteProbe> => {
      const symbol = normalizeSymbol(raw) ?? raw;
      const querySymbol = forSource(symbol, source);
      const started = Date.now();
      const base = {
        symbol,
        source,
        querySymbol,
        httpStatus: null,
        firstLine: null,
        quotes: 0,
        lastDate: null,
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(sourceUrl(source, symbol), {
          signal: controller.signal,
          headers: {
            accept: source === "yahoo" ? "application/json" : "text/csv,text/plain",
            "user-agent": "Mozilla/5.0 (compatible; Rachar/1.0; +https://rachar.pt)",
          },
          cache: "no-store",
        });
        const text = await res.text();
        const firstLine = text.replace(/\s+/g, " ").slice(0, 120);
        const ms = Date.now() - started;

        if (looksBlocked(text)) {
          return {
            ...base,
            verdict: "bloqueada",
            message:
              "A fonte respondeu com uma página de bloqueio em vez de dados. Recusa pedidos de servidores: não é o símbolo, é a fonte.",
            httpStatus: res.status,
            firstLine,
            ms,
          };
        }
        if (!res.ok) {
          return {
            ...base,
            verdict: "resposta-estranha",
            message: `A fonte respondeu ${res.status}. Não é o símbolo, é a fonte.`,
            httpStatus: res.status,
            firstLine,
            ms,
          };
        }

        const parsed = parseFor(source, text);
        if (parsed.length === 0) {
          return {
            ...base,
            verdict: "simbolo-desconhecido",
            message: `A fonte respondeu com dados, mas não conhece "${querySymbol}". É o símbolo.`,
            httpStatus: res.status,
            firstLine,
            ms,
          };
        }
        const last = parsed[parsed.length - 1]!;
        return {
          ...base,
          verdict: "ok",
          message: `Funciona: ${parsed.length} cotações, a última de ${last.date}.`,
          httpStatus: res.status,
          firstLine,
          quotes: parsed.length,
          lastDate: last.date,
          ms,
        };
      } catch (e) {
        return {
          ...base,
          verdict: "sem-rede",
          message:
            "Não consegui sequer falar com a fonte. É rede ou bloqueio de saída, não é o símbolo.",
          firstLine: e instanceof Error ? e.message.slice(0, 120) : null,
          ms: Date.now() - started,
        };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}

export interface PriceFreshness {
  assetId: string;
  symbol: string;
  /** De que dia é o fecho que está a ser mostrado. */
  quoteDate: string | null;
  /** Foi buscar cotação nova nesta visita. */
  refreshed: boolean;
}

/**
 * Põe os preços em dia ao abrir a página.
 *
 * Sem isto, o preço de um investimento era o do dia em que alguém carregou no
 * botão, e ficava lá parado sem dizer de quando era. Um valor desatualizado que
 * se apresenta como atual é pior do que não ter valor nenhum: as contas todas
 * que dependem dele (património, ganho, comparação com o índice) ficam erradas
 * sem dar sinal.
 *
 * Só vai à fonte quando a cotação guardada está velha, e as cotações são um
 * cache partilhado por toda a gente, por isso cada símbolo é buscado uma vez por
 * dia no serviço inteiro, não uma vez por visita. Se a fonte falhar, fica o
 * preço que havia, e quem chama mostra a data para não haver enganos.
 */
export async function refreshStalePrices(spaceId: string): Promise<PriceFreshness[]> {
  const repo = getRepository();
  const assets = await repo.listAssets(spaceId).catch(() => []);
  const withSymbol = assets.filter((a) => a.kind === "investimento" && a.symbol);
  if (withSymbol.length === 0) return [];

  return Promise.all(
    withSymbol.map(async (a): Promise<PriceFreshness> => {
      // Um ticker escrito à mão vem quase sempre sem sufixo de praça ("MSFT",
      // não "msft.us"), e sem sufixo a fonte não o encontra. Tentam-se as
      // formas prováveis, e guarda-se a que funcionou para não se andar a
      // tentar três de cada vez para sempre.
      const candidatos = symbolCandidates(a.symbol!);
      let series = null;
      for (const c of candidatos) {
        const tentativa = await getQuoteSeries(c).catch(() => null);
        if (tentativa && tentativa.quotes.length > 0) {
          series = tentativa;
          if (c !== a.symbol) {
            await repo.updateAsset(a.id, spaceId, { symbol: c }).catch(() => {});
          }
          break;
        }
      }
      const symbol = series?.symbol ?? a.symbol!;
      const quoteDate = series?.lastDate ?? null;

      // Só se escreve quando o preço mudou mesmo: poupa escritas em cada visita.
      if (
        series?.lastCloseCents !== null &&
        series?.lastCloseCents !== undefined &&
        series.lastCloseCents !== a.unitPriceCents
      ) {
        await repo
          .updateAsset(a.id, spaceId, { unitPriceCents: series.lastCloseCents })
          .catch(() => {});
        return { assetId: a.id, symbol, quoteDate, refreshed: true };
      }
      return { assetId: a.id, symbol, quoteDate, refreshed: false };
    }),
  );
}

/**
 * Atualiza o preço atual de um investimento a partir da sua cotação.
 *
 * Só mexe no preço se a cotação existir: um investimento sem símbolo, ou com um
 * símbolo que a fonte não conhece, fica exatamente como estava.
 */
export async function refreshAssetPrice(
  assetId: string,
  spaceId: string,
  symbol: string,
): Promise<{ ok: boolean; message: string }> {
  const series = await getQuoteSeries(symbol, { force: true });
  if (series.lastCloseCents === null) {
    return { ok: false, message: series.problem ?? "Sem cotações para este símbolo." };
  }
  try {
    await getRepository().updateAsset(assetId, spaceId, {
      unitPriceCents: series.lastCloseCents,
    });
  } catch {
    return { ok: false, message: "Não consegui gravar o preço." };
  }
  const dia = new Date(`${series.lastDate}T00:00:00Z`).toLocaleDateString("pt-PT");
  return {
    ok: true,
    message: `Preço atualizado com o fecho de ${dia}.`,
  };
}
