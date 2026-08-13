/**
 * Ir buscar a Euribor ao Banco Central Europeu.
 *
 * A rede fica aqui; a leitura do formato está no domínio, em funções puras com
 * testes. É a mesma divisão das cotações e pela mesma razão: um formato que
 * muda tem de se poder exercitar sem rede.
 *
 * **Nunca atira e nunca inventa.** Se a fonte não responder, devolve o motivo
 * por extenso e o campo continua a escrever-se à mão, como já se escrevia. Uma
 * taxa inventada entra num plano de crédito e sai de lá como uma prestação até
 * 2055 — não há número nesta app com mais alcance a partir de menos dígitos.
 */

import {
  mesesDeAtraso,
  parseEuriborBCE,
  periodoPorExtenso,
  ultimaEuribor,
  urlDaSerie,
  type Indexante,
} from "@/lib/domain";

const TIMEOUT_MS = 10_000;

export interface EuriborResult {
  pct: number | null;
  /** "AAAA-MM" a que a média diz respeito. */
  periodo: string | null;
  /** Uma frase pronta para o ecrã, a dizer de quando é. */
  nota: string | null;
  problem: string | null;
}

export async function buscarEuribor(indexante: Indexante): Promise<EuriborResult> {
  const vazio = { pct: null, periodo: null, nota: null };

  let texto: string;
  try {
    const controlo = new AbortController();
    const t = setTimeout(() => controlo.abort(), TIMEOUT_MS);
    const res = await fetch(urlDaSerie(indexante), {
      signal: controlo.signal,
      headers: { accept: "application/json" },
      // Uma média mensal muda uma vez por mês; um dia de cache é generoso e
      // continua a ser mais fresco do que o que se precisa.
      next: { revalidate: 86_400 },
    });
    clearTimeout(t);
    if (!res.ok) {
      return { ...vazio, problem: `O Banco Central Europeu respondeu ${res.status}.` };
    }
    texto = await res.text();
  } catch {
    return { ...vazio, problem: "Não consegui falar com o Banco Central Europeu." };
  }

  const valores = parseEuriborBCE(texto);
  const ultimo = ultimaEuribor(valores);
  if (!ultimo) {
    return { ...vazio, problem: "A resposta do Banco Central Europeu não trouxe valores." };
  }

  const hoje = new Date().toISOString().slice(0, 7);
  const atraso = mesesDeAtraso(ultimo.periodo, hoje);
  return {
    pct: ultimo.pct,
    periodo: ultimo.periodo,
    // De quando é, sempre. Uma média de há três meses apresentada sem data
    // lê-se como a de agora, e é com ela que se calcula uma prestação.
    nota:
      atraso >= 2
        ? `Média de ${periodoPorExtenso(ultimo.periodo)} — é a mais recente que o BCE publicou, mas já tem ${atraso} meses.`
        : `Média de ${periodoPorExtenso(ultimo.periodo)}, publicada pelo BCE.`,
    problem: null,
  };
}
