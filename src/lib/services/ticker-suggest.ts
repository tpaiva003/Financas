/**
 * Descobrir o símbolo de bolsa a partir do nome do produto.
 *
 * **O problema.** Os ficheiros de corretora trazem "KNOT OFFSHORE PARTNERS" ou
 * "Vanguard FTSE All-World UCITS ETF", e a app precisa de `knop.us` ou `vwce.de`
 * para ir buscar cotações. Sem símbolo, o investimento vale o que alguém
 * escreveu à mão e nunca mais se mexe: sem preço atual, sem ganho, sem TWR.
 * Escrever o símbolo à mão para dezenas de produtos importados não é trabalho
 * que se peça a ninguém.
 *
 * **A regra: o modelo sugere, os factos confirmam.** O modelo é bom a ligar um
 * nome comercial a um ticker, e é péssimo a saber se esse ticker existe mesmo
 * naquela praça. Por isso nada do que ele responde vale por si: cada candidato
 * é experimentado contra a fonte de cotações, e só conta se ela devolver série.
 *
 * **Um ticker errado é MUITO pior do que nenhum.** Um símbolo que não existe dá
 * um erro que se vê. Um símbolo que existe mas é de outra empresa dá um preço
 * plausível, todos os dias, para sempre — e ninguém desconfia de um número que
 * parece uma cotação. É por isso que a verificação não é opcional e que a
 * sugestão vai sempre para confirmação humana em vez de ser aplicada sozinha.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";

import { normalizeSymbol, symbolCandidates } from "@/lib/domain";
import { getQuoteSeries } from "./quotes-service";

const MODELO = "claude-opus-5";
const TIMEOUT_MS = 60_000;
/** Quantos candidatos se experimentam. Passar disto é insistir sem proveito. */
const MAX_CANDIDATOS = 6;

const Resposta = z.object({
  candidatos: z
    .array(
      z.object({
        simbolo: z
          .string()
          .describe(
            "O ticker, com sufixo de praça quando aplicável: 'aapl.us', 'vwce.de', 'bp.uk'. Sem sufixo se for americano e não souberes.",
          ),
        bolsa: z.string().describe("Em que bolsa negoceia, por extenso."),
        moeda: z.string().describe("Código de três letras da moeda de negociação."),
        porque: z.string().describe("Uma frase a dizer porque achas que é este."),
      }),
    )
    .describe("Do mais provável para o menos provável. Vazio se não fizeres ideia."),
  notas: z.string().describe("Uma ou duas frases em português sobre o que percebeste do nome."),
});

const INSTRUCOES = `Recebes o nome de um produto financeiro tal como vem num extrato de corretora e dizes que tickers de bolsa podem corresponder-lhe.

Devolves candidatos por ordem de probabilidade. Nunca inventes um ticker para não vir de mãos vazias: uma lista vazia é uma resposta perfeitamente aceitável e muito melhor do que um palpite. O programa vai verificar cada candidato contra uma fonte de cotações e descartar os que não existirem, mas um ticker que existe e é da empresa errada passa nessa verificação — por isso a responsabilidade de não adivinhar é tua.

Convenção dos sufixos:
- Ações e ETF dos EUA: sufixo ".us" (aapl.us, msft.us).
- Alemanha / Xetra, onde negoceiam muitos ETF europeus: ".de" (vwce.de).
- Reino Unido: ".uk". França: ".fr". Países Baixos: ".nl". Espanha: ".es". Portugal: ".pt".
- Índices começam por "^" (^spx).

Coisas que enganam:
- Os nomes vêm truncados, em maiúsculas e sem pontuação: "KNOT OFFSHORE PARTNERS", "ISHARES CORE MSCI WORLD".
- Um ETF com o mesmo índice tem cotações diferentes conforme a praça e a classe. Se o nome disser a moeda ou a praça, usa-a.
- Empresas com nomes parecidos em países diferentes são a forma mais fácil de acertar no ticker errado. Se o nome não chegar para desempatar, devolve os dois candidatos em vez de escolher.
- Se o nome for de uma conta, de um depósito, de um saldo de tesouraria ou de outra coisa que não negoceia em bolsa, devolve lista vazia.`;

export interface TickerSuggestion {
  /** O símbolo já verificado contra a fonte de cotações. */
  symbol: string;
  /** Em que praça e moeda, como o modelo o descreveu. */
  bolsa: string;
  moeda: string;
  porque: string;
  /** A moeda que a fonte de cotações devolveu de facto. */
  currencyConfirmada: string;
  /** A última data com cotação, para se ver se a série é atual. */
  lastDate: string | null;
}

export interface TickerSuggestResult {
  suggestion: TickerSuggestion | null;
  /** Candidatos que o modelo deu e a fonte não confirmou. Para diagnóstico. */
  descartados: string[];
  problem: string | null;
}

/** Há chave configurada? Sem ela este caminho não existe e não se anuncia. */
export function tickerSuggestAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Um candidato só vale se a fonte de cotações devolver mesmo uma série.
 *
 * Experimenta as formas do símbolo pela ordem em que o `symbolCandidates` as
 * põe — as explícitas primeiro, a ambígua no fim — porque um ticker sem sufixo
 * pode devolver o instrumento errado noutra praça.
 */
async function verificar(
  bruto: string,
): Promise<{ symbol: string; currency: string; lastDate: string | null } | null> {
  for (const forma of symbolCandidates(bruto).slice(0, 3)) {
    const series = await getQuoteSeries(forma, { latestOnly: true }).catch(() => null);
    if (series && series.quotes.length > 0 && series.lastCloseCents !== null) {
      return { symbol: forma, currency: series.currency, lastDate: series.lastDate };
    }
  }
  return null;
}

/**
 * Sugere um símbolo para um nome de produto. Devolve sempre, nunca atira.
 *
 * A sugestão é para **confirmação**, nunca para aplicação automática. Ver o
 * cabeçalho: um ticker errado é pior do que nenhum.
 */
export async function suggestTicker(name: string): Promise<TickerSuggestResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { suggestion: null, descartados: [], problem: "A sugestão assistida não está configurada." };
  }
  const nome = (name ?? "").trim();
  if (!nome) return { suggestion: null, descartados: [], problem: "Sem nome para procurar." };

  let candidatos: { simbolo: string; bolsa: string; moeda: string; porque: string }[];
  let notas = "";
  try {
    const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
    const resposta = await client.messages.parse({
      model: MODELO,
      max_tokens: 4_000,
      system: INSTRUCOES,
      // Ligar um nome a um ticker é conhecimento, não raciocínio longo.
      output_config: { effort: "low", format: zodOutputFormat(Resposta) },
      messages: [{ role: "user", content: `Nome do produto: ${nome}` }],
    });
    if (resposta.stop_reason === "refusal") {
      return { suggestion: null, descartados: [], problem: "O modelo recusou responder." };
    }
    const lida = resposta.parsed_output;
    if (!lida) {
      return { suggestion: null, descartados: [], problem: "Não percebi a resposta do modelo." };
    }
    candidatos = lida.candidatos ?? [];
    notas = lida.notas ?? "";
  } catch {
    return { suggestion: null, descartados: [], problem: "Não consegui falar com o serviço." };
  }

  if (candidatos.length === 0) {
    return {
      suggestion: null,
      descartados: [],
      problem: notas || "Não reconheci este nome como um produto de bolsa.",
    };
  }

  const descartados: string[] = [];
  for (const c of candidatos.slice(0, MAX_CANDIDATOS)) {
    // Um símbolo que nem sequer é um símbolo não vai à fonte.
    if (!normalizeSymbol(c.simbolo)) continue;
    const confirmado = await verificar(c.simbolo);
    if (confirmado) {
      return {
        suggestion: {
          symbol: confirmado.symbol,
          bolsa: c.bolsa,
          moeda: c.moeda,
          porque: c.porque,
          currencyConfirmada: confirmado.currency,
          lastDate: confirmado.lastDate,
        },
        descartados,
        problem: null,
      };
    }
    descartados.push(c.simbolo);
  }

  return {
    suggestion: null,
    descartados,
    problem:
      descartados.length > 0
        ? `Nenhum dos símbolos sugeridos tem cotações: ${descartados.join(", ")}.`
        : "Não encontrei símbolo com cotações para este nome.",
  };
}
