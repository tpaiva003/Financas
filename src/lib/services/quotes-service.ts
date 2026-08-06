/**
 * Ir buscar cotações e guardá-las.
 *
 * Fonte: Stooq, que serve o histórico diário em CSV sem chave nem registo. Não
 * é a Bloomberg, mas para fecho diário de ETFs e índices chega perfeitamente, e
 * a alternativa realista (uma API paga) não se justifica para isto.
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
import { isStale, normalizeSymbol, parseStooqCsv } from "@/lib/domain";

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

function csvUrl(symbol: string, from?: string | null): string {
  const params = new URLSearchParams({ s: symbol, i: "d" });
  if (from) params.set("d1", from.replaceAll("-", ""));
  return `https://stooq.com/q/d/l/?${params}`;
}

/** Vai à fonte. Devolve lista vazia se o símbolo não existir lá. */
async function fetchFromSource(symbol: string, from?: string | null): Promise<StoredQuote[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(csvUrl(symbol, from), {
      signal: controller.signal,
      headers: { accept: "text/csv,text/plain" },
      next: { revalidate: 3_600 },
    });
    if (!res.ok) return [];
    return parseStooqCsv(await res.text());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
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
