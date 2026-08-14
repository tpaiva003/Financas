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
import { fetchReferenceRate } from "./fx-rate";
import {
  QUOTE_SOURCES,
  forSource,
  isForeign,
  isStale,
  looksBlocked,
  toEurCents,
  normalizeSymbol,
  parseStooqCsv,
  parseYahooChart,
  symbolCandidates,
  type Quote,
  type QuoteSourceId,
} from "@/lib/domain";

const TIMEOUT_MS = 10_000;
/**
 * O mesmo tecto, mas quando ninguém pediu para esperar.
 *
 * **Dez segundos é o que se dá a quem carregou num botão** e está a olhar para
 * ele. Ao desenhar a página do património, essa mesma espera é imposta a quem só
 * queria mudar de menu — e como as fontes se tentam uma a seguir à outra, um
 * único símbolo que ninguém conhece bloqueia o ecrã vinte segundos. Com seis
 * desses por visita, a página parecia avariada.
 *
 * Três segundos chegam de sobra para uma fonte que está de pé. O que não couber
 * fica para a visita seguinte e **diz-se por palavras** na linha do
 * investimento, em vez de um preço velho passar por atual.
 */
const TIMEOUT_NA_VISITA_MS = 3_000;

export interface QuoteSeries {
  symbol: string;
  quotes: StoredQuote[];
  /** Em que moeda está a série. Nem sempre é o euro. */
  currency: string;
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

function parseFor(source: QuoteSourceId, text: string): { quotes: Quote[]; currency: string } {
  if (source === "yahoo") return parseYahooChart(text);
  // A Stooq não diz a moeda. Como está bloqueada e serve só de reserva, assume-se
  // pelo sufixo de praça, que é o que ela própria usa.
  return { quotes: parseStooqCsv(text), currency: "EUR" };
}

/** Uma tentativa numa fonte, com o motivo quando não dá. */
interface Attempt {
  quotes: Quote[];
  currency: string;
  blocked: boolean;
  /**
   * Porque é que não deu, por extenso.
   *
   * O `blocked` existia e **nunca era lido**: uma fonte a recusar o pedido era
   * indistinguível de um símbolo que não existe, e a app acusava o símbolo. São
   * coisas opostas — uma resolve-se esperando, a outra corrigindo o ticker.
   */
  motivo?: string | null;
}

async function fetchFrom(
  source: QuoteSourceId,
  symbol: string,
  from?: string | null,
  /**
   * Quem carregou no botão quer o valor de agora.
   *
   * Sem isto, o `force` só saltava a verificação contra a base de dados: uma
   * resposta 200 sem dados ficava uma hora na cache do Next e o botão não a
   * contornava — carregar outra vez dava exatamente o mesmo nada.
   */
  force = false,
  timeoutMs: number = TIMEOUT_MS,
): Promise<Attempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(sourceUrl(source, symbol, from), {
      signal: controller.signal,
      headers: {
        accept: source === "yahoo" ? "application/json" : "text/csv,text/plain",
        // Sem isto, algumas fontes respondem com uma página de bloqueio a
        // pedidos que não parecem vir de um browser.
        "user-agent": "Mozilla/5.0 (compatible; Rachar/1.0; +https://rachar.pt)",
      },
      ...(force ? { cache: "no-store" as const } : { next: { revalidate: 3_600 } }),
    });
    if (!res.ok) {
      return { quotes: [], currency: "EUR", blocked: false, motivo: `${source} respondeu ${res.status}` };
    }
    const text = await res.text();
    if (looksBlocked(text)) {
      return { quotes: [], currency: "EUR", blocked: true, motivo: `${source} recusou o pedido` };
    }
    const lido = parseFor(source, text);
    return {
      ...lido,
      blocked: false,
      motivo: lido.quotes.length === 0 ? `${source} não conhece este símbolo` : null,
    };
  } catch {
    return { quotes: [], currency: "EUR", blocked: false, motivo: `não consegui falar com a ${source}` };
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
async function fetchFromSource(
  symbol: string,
  from?: string | null,
  force = false,
  timeoutMs: number = TIMEOUT_MS,
): Promise<{ quotes: StoredQuote[]; currency: string; motivo: string | null }> {
  const motivos: string[] = [];
  for (const source of QUOTE_SOURCES) {
    const attempt = await fetchFrom(source, symbol, from, force, timeoutMs);
    if (attempt.quotes.length > 0) {
      return { quotes: attempt.quotes, currency: attempt.currency, motivo: null };
    }
    if (attempt.motivo) motivos.push(attempt.motivo);
  }
  // Todas falharam: diz-se o que cada uma respondeu. "Não encontrei cotações
  // para este símbolo" culpa o símbolo, e na maior parte das vezes o símbolo
  // está certo e quem recusou foi a fonte.
  return { quotes: [], currency: "EUR", motivo: motivos.join("; ") || null };
}

/**
 * A série de um símbolo, atualizada se estiver velha.
 *
 * `since` limita o que se lê da base de dados: para a comparação com o índice
 * basta desde o primeiro reforço, não desde sempre.
 */
export async function getQuoteSeries(
  rawSymbol: string,
  options: {
    since?: string | null;
    force?: boolean;
    latestOnly?: boolean;
    /**
     * Quanto tempo esperar por cada fonte.
     *
     * Existe para o desenho de uma página não impor a espera de quem carregou
     * num botão. Ver `TIMEOUT_NA_VISITA_MS`.
     */
    timeoutMs?: number;
  } = {},
): Promise<QuoteSeries> {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) {
    return {
      symbol: rawSymbol,
      quotes: [],
      currency: "EUR",
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
  let fetchedCurrency: string | null = null;

  if (options.force || isStale(lastDate, today)) {
    // Pede-se só o que falta. Da primeira vez não há nada, e vem tudo.
    const { quotes: fetched, currency, motivo } = await fetchFromSource(
      symbol,
      lastDate,
      options.force,
      options.timeoutMs ?? TIMEOUT_MS,
    );
    fetchedCurrency = currency;
    if (fetched.length === 0) {
      // O motivo por extenso quando o há. "Não encontrei cotações para este
      // símbolo" acusa o símbolo, e quase sempre o símbolo está certo e quem
      // recusou foi a fonte — que são problemas opostos: um espera-se, o outro
      // corrige-se à mão.
      const base = lastDate
        ? "Não consegui atualizar as cotações agora"
        : "Não consegui obter cotações para este símbolo";
      problem = motivo ? `${base}: ${motivo}.` : `${base}.`;
    } else {
      try {
        await repo.saveQuotes(symbol, fetched, currency);
        refreshed = true;
      } catch {
        problem = "Fui buscar as cotações mas não as consegui guardar.";
      }
    }
  }

  // Quem só quer o preço de agora não precisa de dez anos de fechos a atravessar
  // a rede: uma linha chega, e é muito mais barato.
  let quotes: StoredQuote[] = [];
  try {
    if (options.latestOnly) {
      const ultima = await repo.latestQuote(symbol);
      quotes = ultima ? [ultima] : [];
    } else {
      quotes = await repo.listQuotes(symbol, options.since ?? undefined);
    }
  } catch {
    problem = problem ?? "Não consegui ler as cotações guardadas.";
  }

  const currency =
    (await repo.quoteCurrency(symbol).catch(() => null)) ?? fetchedCurrency ?? "EUR";

  const last = quotes.length > 0 ? quotes[quotes.length - 1]! : null;
  return {
    symbol,
    quotes,
    currency,
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

        const { quotes: parsed, currency: moeda } = parseFor(source, text);
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
          message: `Funciona: ${parsed.length} cotações em ${moeda}, a última de ${last.date}.`,
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
  /** Porque é que o preço não foi atualizado, quando não foi. */
  problem: string | null;
  /**
   * O fecho **na moeda em que a bolsa o cota**, antes de converter.
   *
   * A app calcula em euros e é assim que tem de ser, mas ninguém confere uma
   * ação americana em euros: quem tem a AAPL vê 270 dólares no telemóvel e quer
   * reconhecer esse número aqui. Fica ao lado do preço em euros.
   */
  quoteCents: number | null;
  quoteCurrency: string | null;
}

/**
 * Converte um fecho para euros, à taxa **do dia da cotação**.
 *
 * A data importa: uma cotação de há dois anos vale o que valia nessa altura, não
 * o que valeria à taxa de hoje. Usar a taxa de hoje para toda a série faria a
 * rentabilidade histórica mexer-se sozinha sempre que o câmbio mexesse.
 */
async function toEurAtDate(
  cents: number,
  currency: string,
  date: string | null,
): Promise<number | null> {
  if (!currency || currency === "EUR") return cents;
  const rate = await fetchReferenceRate(currency, date).catch(() => null);
  if (!rate) return null;
  return toEurCents(cents, rate.rate);
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
/**
 * Quantos símbolos podem ir à rede numa visita.
 *
 * **Existe porque a página do património demorava uma eternidade a abrir.** Um
 * símbolo que a fonte não conhece nunca chega a ter cotação guardada, e por isso
 * conta como "velho" **em todas as visitas para sempre** — quatro tentativas com
 * dez segundos de espera cada, por cada um deles, sempre. Com uma dúzia desses
 * na carteira, abrir o ecrã passava a ser uma ida à rede de vários minutos.
 *
 * Com um tecto, cada visita adianta um pouco e nenhuma paga tudo. Quem quiser
 * tudo de uma vez carrega no botão, que passa `force` e não tem tecto: aí a
 * espera é pedida, e uma espera pedida não é o mesmo que uma imposta.
 */
const MAX_IDAS_A_REDE_POR_VISITA = 6;

export async function refreshStalePrices(
  spaceId: string,
  options: { force?: boolean } = {},
): Promise<PriceFreshness[]> {
  const repo = getRepository();
  const assets = await repo.listAssets(spaceId).catch(() => []);
  const withSymbol = assets.filter((a) => a.kind === "investimento" && a.symbol);
  if (withSymbol.length === 0) return [];

  /**
   * Tudo o que está guardado, numa consulta só.
   *
   * Antes eram três idas à base de dados por símbolo, e com meia centena de
   * investimentos isso são cento e cinquenta viagens para desenhar um ecrã cujos
   * dados já estavam gravados.
   */
  const candidatosDeTodos = withSymbol.flatMap((a) => symbolCandidates(a.symbol!));
  const guardadas = await repo.latestQuotesFor(candidatosDeTodos).catch(() => new Map());
  const hoje = new Date().toISOString().slice(0, 10);

  // Quem já tem cotação fresca não vai à rede nem à base de dados outra vez.
  let idasDisponiveis = options.force ? Number.POSITIVE_INFINITY : MAX_IDAS_A_REDE_POR_VISITA;

  return Promise.all(
    withSymbol.map(async (a): Promise<PriceFreshness> => {
      /**
       * O atalho: já há cotação fresca guardada para uma das formas do símbolo.
       *
       * Sem `force`, este caminho não toca na rede nem faz mais consultas — e é
       * o caminho de quase todos os investimentos em quase todas as visitas.
       */
      if (!options.force) {
        const fresca = symbolCandidates(a.symbol!)
          .map((c) => ({ c, q: guardadas.get(c) }))
          .find((x) => x.q && !isStale(x.q.date, hoje));

        if (fresca?.q) {
          const q = fresca.q;
          const original = isForeign(q.currency)
            ? { quoteCents: q.closeCents, quoteCurrency: q.currency }
            : { quoteCents: null, quoteCurrency: null };

          const emEuros = await toEurAtDate(q.closeCents, q.currency, q.date);
          if (emEuros === null) {
            return {
              assetId: a.id,
              symbol: fresca.c,
              quoteDate: q.date,
              refreshed: false,
              problem: `Cotação em ${q.currency} e sem taxa de câmbio para a converter.`,
              quoteCents: null,
              quoteCurrency: null,
            };
          }
          if (emEuros !== a.unitPriceCents) {
            const gravou = await repo
              .updateAsset(a.id, spaceId, { unitPriceCents: emEuros })
              .then(() => true)
              .catch(() => false);
            return {
              assetId: a.id,
              symbol: fresca.c,
              quoteDate: q.date,
              refreshed: gravou,
              problem: gravou ? null : "Fui buscar a cotação mas não a consegui guardar.",
              ...original,
            };
          }
          return {
            assetId: a.id,
            symbol: fresca.c,
            quoteDate: q.date,
            refreshed: false,
            problem: null,
            ...original,
          };
        }

        // Está velha e o tecto já foi gasto: fica para a próxima visita, com o
        // que se sabe. Um preço velho identificado como velho é informação.
        if (idasDisponiveis <= 0) {
          const qualquer = symbolCandidates(a.symbol!)
            .map((c) => ({ c, q: guardadas.get(c) }))
            .find((x) => x.q);
          return {
            assetId: a.id,
            symbol: qualquer?.c ?? a.symbol!,
            quoteDate: qualquer?.q?.date ?? null,
            refreshed: false,
            problem:
              "Ainda não fui buscar a cotação nesta visita. Carrega em «Atualizar preços» para não esperar pela próxima.",
            quoteCents: null,
            quoteCurrency: null,
          };
        }
        idasDisponiveis -= 1;
      }

      // Um ticker escrito à mão vem quase sempre sem sufixo de praça ("MSFT",
      // não "msft.us"), e sem sufixo a fonte não o encontra. Tentam-se as
      // formas prováveis, e guarda-se a que funcionou para não se andar a
      // tentar três de cada vez para sempre.
      const candidatos = symbolCandidates(a.symbol!);
      let series = null;
      /**
       * O motivo da última tentativa falhada.
       *
       * Sem isto o motivo era **provadamente sempre perdido**: `series` só era
       * atribuída quando vinham cotações, e por isso `series?.problem` no fim
       * dava sempre `null`. O botão "Atualizar preços" respondia "1 já estava em
       * dia" a um investimento que não tem preço nenhum.
       */
      let porque: string | null = null;
      for (const c of candidatos) {
        // Com `force`, vai-se à fonte mesmo que a cotação guardada pareça
        // fresca: quem carregou no botão quer o valor de agora, não o de ontem.
        const tentativa = await getQuoteSeries(c, {
          latestOnly: true,
          force: options.force,
          // Sem `force` isto está a correr no meio do desenho de uma página, e
          // a espera não foi pedida por ninguém. Ver `TIMEOUT_NA_VISITA_MS`.
          timeoutMs: options.force ? TIMEOUT_MS : TIMEOUT_NA_VISITA_MS,
        }).catch(() => null);
        if (tentativa && tentativa.quotes.length > 0) {
          series = tentativa;
          if (c !== a.symbol) {
            await repo.updateAsset(a.id, spaceId, { symbol: c }).catch(() => {});
          }
          break;
        }
        porque = tentativa?.problem ?? porque ?? "Não consegui falar com a fonte de cotações.";
      }
      const symbol = series?.symbol ?? a.symbol!;
      const quoteDate = series?.lastDate ?? null;
      // O fecho como a bolsa o cota, para se poder conferir com o telemóvel.
      // Só se mostra quando não é euro: "232,45 € · 232,45 EUR" não diz nada.
      const original =
        series && isForeign(series.currency)
          ? { quoteCents: series.lastCloseCents, quoteCurrency: series.currency }
          : { quoteCents: null, quoteCurrency: null };
      const vazio = { quoteCents: null, quoteCurrency: null };

      if (series?.lastCloseCents === null || series?.lastCloseCents === undefined) {
        return {
          assetId: a.id,
          symbol,
          quoteDate,
          refreshed: false,
          problem: series?.problem ?? porque,
          ...vazio,
        };
      }

      // A cotação pode vir noutra moeda: o MSFT vem em dólares. Converter é
      // obrigatório, e **à taxa do dia da cotação**, não à de hoje.
      const emEuros = await toEurAtDate(series.lastCloseCents, series.currency, quoteDate);
      if (emEuros === null) {
        // Sem câmbio não se grava. Gravar dólares como euros inflacionava o
        // património e o número errado apresentava-se como certo. E não se
        // mostra o valor original ao lado de um preço em euros que não é o dele.
        return {
          assetId: a.id,
          symbol,
          quoteDate,
          refreshed: false,
          problem: `Cotação em ${series.currency} e sem taxa de câmbio para a converter.`,
          ...vazio,
        };
      }

      // Só se escreve quando o preço mudou mesmo: poupa escritas em cada visita.
      if (emEuros !== a.unitPriceCents) {
        // Uma escrita que falha não é uma atualização. Devolver `refreshed:
        // true` aqui fazia o botão dizer "1 preço atualizado" e o ecrã continuar
        // a mostrar o preço velho — a mentira mais convincente das duas.
        const gravou = await repo
          .updateAsset(a.id, spaceId, { unitPriceCents: emEuros })
          .then(() => true)
          .catch(() => false);
        return {
          assetId: a.id,
          symbol,
          quoteDate,
          refreshed: gravou,
          problem: gravou ? null : "Fui buscar a cotação mas não a consegui guardar.",
          ...original,
        };
      }
      return { assetId: a.id, symbol, quoteDate, refreshed: false, problem: null, ...original };
    }),
  );
}

/**
 * Atualiza o preço atual de um investimento a partir da sua cotação.
 *
 * Só mexe no preço se a cotação existir: um investimento sem símbolo, ou com um
 * símbolo que a fonte não conhece, fica exatamente como estava.
 *
 * **Converte para euros**, tal como a atualização automática. Este caminho ficou
 * a gravar a cotação em bruto quando o outro passou a converter, e a diferença
 * não se via: um MSFT a 495 dólares aparecia como 495 €, quase dez por cento
 * acima do que vale. Dois caminhos que escrevem o mesmo campo têm de aplicar as
 * mesmas regras, senão o valor certo depende de que botão se carregou.
 */
export async function refreshAssetPrice(
  assetId: string,
  spaceId: string,
  symbol: string,
): Promise<{ ok: boolean; message: string }> {
  const series = await getQuoteSeries(symbol, { force: true, latestOnly: true });
  if (series.lastCloseCents === null) {
    return { ok: false, message: series.problem ?? "Sem cotações para este símbolo." };
  }
  const emEuros = await toEurAtDate(series.lastCloseCents, series.currency, series.lastDate);
  if (emEuros === null) {
    return {
      ok: false,
      message: `Cotação em ${series.currency} e sem taxa de câmbio para a converter.`,
    };
  }
  try {
    await getRepository().updateAsset(assetId, spaceId, { unitPriceCents: emEuros });
  } catch {
    return { ok: false, message: "Não consegui gravar o preço." };
  }
  const dia = new Date(`${series.lastDate}T00:00:00Z`).toLocaleDateString("pt-PT");
  const nota = series.currency === "EUR" ? "" : ` (convertido de ${series.currency})`;
  return {
    ok: true,
    message: `Preço atualizado com o fecho de ${dia}${nota}.`,
  };
}
