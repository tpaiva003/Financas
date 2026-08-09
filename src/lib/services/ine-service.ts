/**
 * O preço mediano por metro quadrado, do INE.
 *
 * **Porquê o INE e não o idealista.** O relatório do idealista é o que toda a
 * gente conhece, e não tem API: só se lá chegava a raspar as páginas, o que
 * viola os termos deles e parte no dia em que mudarem o HTML. O INE publica o
 * mesmo tipo de indicador — valor mediano das vendas de alojamentos familiares,
 * em €/m², por concelho — numa API pública e documentada. É estatística
 * oficial, sai com atraso de uns meses, e é a mediana das escrituras e não dos
 * anúncios: costuma dar mais baixo do que o idealista, porque os anúncios são
 * pedidos e as escrituras são o que se pagou mesmo.
 *
 * **O código do indicador está numa variável de ambiente, e é de propósito.** O
 * INE renumera indicadores quando muda a metodologia — a série de 2022 tem um
 * código diferente da de 2018 — e um número fixo no código obrigava a um deploy
 * para uma coisa que se resolve numa linha de configuração. O
 * `INE_PRECO_M2_URL` permite substituir o pedido inteiro, para o caso de o
 * indicador precisar de dimensões que este não passa.
 *
 * **Nada disto deita a app abaixo.** Se o INE não responder, ou responder uma
 * coisa que não se percebe, diz-se — e continua a poder escrever-se o preço à
 * mão. O que não se faz é devolver uma tabela vazia em silêncio, que se leria
 * como "o teu concelho não tem dados".
 */

import { parseInePriceTable, type InePriceTable } from "@/lib/domain";

const BASE = "https://www.ine.pt/ine/json_indicador/pindica.jsp";

/**
 * O indicador por omissão: valor mediano das vendas de alojamentos familiares
 * por m². **Confirma-o** na página do indicador do INE antes de contar com ele
 * — foi escrito sem se poder fazer a chamada, e o INE renumera as séries.
 */
const VARCD_OMISSAO = "0012530";

const TIMEOUT_MS = 20_000;
/** Estatística que sai uma vez por trimestre não precisa de vir a cada visita. */
const TTL_MS = 12 * 60 * 60 * 1000;

export interface InePriceResult {
  table: InePriceTable | null;
  /** De onde veio, para se poder mostrar e para se saber o que confirmar. */
  fonte: string;
  problem: string | null;
}

let cache: { at: number; result: InePriceResult } | null = null;

function urlDoIndicador(): { url: string; fonte: string } {
  const override = process.env.INE_PRECO_M2_URL;
  if (override) return { url: override, fonte: "INE" };
  const varcd = process.env.INE_PRECO_M2_VARCD || VARCD_OMISSAO;
  return { url: `${BASE}?op=2&varcd=${encodeURIComponent(varcd)}&lang=PT`, fonte: `INE · ${varcd}` };
}

/** Limpa a cache. Só para os testes: em produção o TTL chega. */
export function resetInePriceCache(): void {
  cache = null;
}

/**
 * A tabela de preços por concelho, do INE.
 *
 * Devolve sempre, nunca atira. Um problema é dito por extenso — incluindo qual
 * o indicador que foi pedido, que é o que faz falta saber quando o INE muda o
 * código da série e isto passa a devolver nada.
 */
export async function getInePriceTable(): Promise<InePriceResult> {
  const agora = Date.now();
  if (cache && agora - cache.at < TTL_MS) return cache.result;

  const { url, fonte } = urlDoIndicador();
  let result: InePriceResult;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const resposta = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    }).finally(() => clearTimeout(timer));

    if (!resposta.ok) {
      result = { table: null, fonte, problem: `O INE respondeu ${resposta.status}.` };
    } else {
      // O INE responde `text/html` a pedir JSON, por isso não se usa `.json()`:
      // lê-se o texto e tenta-se converter, que dá uma mensagem melhor quando
      // o que volta é uma página de erro em vez de dados.
      const texto = await resposta.text();
      let bruto: unknown = null;
      try {
        bruto = JSON.parse(texto);
      } catch {
        bruto = null;
      }
      const table = parseInePriceTable(bruto);
      result = table
        ? { table, fonte, problem: null }
        : {
            table: null,
            fonte,
            problem: `Não percebi o que o INE devolveu para ${fonte}. Se o código do indicador tiver mudado, é o INE_PRECO_M2_VARCD que se altera.`,
          };
    }
  } catch {
    result = { table: null, fonte, problem: "Não consegui falar com o INE." };
  }

  // Um erro também fica em cache, mas por pouco tempo: sem isso, uma página
  // com três imóveis fazia três pedidos ao INE de cada vez que era aberta.
  cache = { at: result.problem ? agora - TTL_MS + 5 * 60 * 1000 : agora, result };
  return result;
}
