/**
 * Taxas de câmbio de referência.
 *
 * Fonte: as taxas de referência do BCE, publicadas todos os dias úteis por volta
 * das 16h CET, servidas pela API do Frankfurter (gratuita, sem chave). O BCE é a
 * fonte certa para isto: é pública, é auditável e é a mesma que a AT usa.
 *
 * Duas coisas que esta função NÃO faz:
 *
 * - **Não inventa taxa.** Se a chamada falhar ou o dia não tiver fixação, diz
 *   que não sabe. Uma taxa aproximada num registo de compra é pior do que
 *   nenhuma, porque passa a parecer um facto.
 * - **Não impõe a taxa.** É uma sugestão para preencher o campo. Quem tem a
 *   nota da corretora sabe a taxa real, com spread, e essa manda.
 *
 * A data devolvida pode ser anterior à pedida: fins de semana e feriados não
 * têm fixação, e o BCE nesses dias não publica nada.
 */

const BASE = "https://api.frankfurter.app";
const TIMEOUT_MS = 6_000;

export interface FxRateResult {
  /** Unidades da moeda estrangeira por euro. */
  rate: number;
  /** O dia da fixação usada, que pode ser anterior ao pedido. */
  date: string;
  source: "BCE";
}

export async function fetchReferenceRate(
  currency: string,
  date?: string | null,
): Promise<FxRateResult | null> {
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code) || code === "EUR") return null;

  // Uma data futura não tem fixação nenhuma: pede-se a última publicada.
  const today = new Date().toISOString().slice(0, 10);
  const day = date && date.slice(0, 10) <= today ? date.slice(0, 10) : "latest";
  const url = `${BASE}/${day}?base=EUR&symbols=${code}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      // As fixações do BCE não mudam depois de publicadas: valem cache longa.
      next: { revalidate: 3_600 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { date?: string; rates?: Record<string, number> };
    const rate = body.rates?.[code];
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
    return { rate, date: body.date ?? day, source: "BCE" };
  } catch {
    // Rede em baixo, tempo esgotado, resposta estranha: quem chama trata disto
    // pedindo a taxa à mão. Nunca deitamos a página abaixo por causa do câmbio.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
