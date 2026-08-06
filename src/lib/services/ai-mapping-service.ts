/**
 * Pedir a um modelo que aponte as colunas do ficheiro da corretora.
 *
 * A deteção por cabeçalhos conhecidos resolve os formatos que já vimos. Este
 * caminho existe para os outros, que são a maioria: cada corretora nomeia as
 * colunas como quer, e ir acrescentando sinónimos à lista de cada vez que
 * aparece um ficheiro novo é uma corrida que se perde sempre.
 *
 * **O modelo escolhe colunas. Não lê dados.** A resposta é uma lista de índices,
 * validada em `ai-mapping.ts` antes de valer alguma coisa, e a leitura dos
 * valores continua a ser feita pelo código de sempre. A deduplicação, o câmbio e
 * as contas nunca passam por aqui.
 *
 * **Falha em silêncio, de propósito.** Sem chave de API, sem rede, ou com uma
 * resposta que não bate certo, isto devolve "não sei" e a importação segue com a
 * deteção normal e com o mapeamento à mão. Uma funcionalidade opcional não pode
 * deitar abaixo a que já funcionava.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
// A v4 do Zod, que é o que o ajudante do SDK pede. O resto do projeto usa a
// clássica; convivem sem problema, vêm no mesmo pacote.
import * as z from "zod/v4";

import {
  renderSample,
  sampleForModel,
  type AiMappingAnswer,
} from "@/lib/import/ai-mapping";
import type { Grid } from "@/lib/import/columns";

const MODELO = "claude-opus-5";
const TIMEOUT_MS = 60_000;

/**
 * O formato da resposta, imposto pela API.
 *
 * Com o esquema declarado, a resposta ou vem nesta forma ou não vem: poupa o
 * trabalho de andar a apanhar JSON meio escrito no meio de texto, que era como
 * isto costumava correr mal.
 */
const Resposta = z.object({
  tipo: z
    .enum(["movimentos", "posicoes", "nenhum"])
    .describe(
      "movimentos = uma linha por operação, com data. posicoes = a fotografia da carteira, sem datas. nenhum = não é nem uma coisa nem outra.",
    ),
  linhaCabecalho: z.number().int().describe("Índice da linha com os nomes das colunas."),
  dataCol: z.number().int().nullable().describe("Data da operação."),
  nomeCol: z.number().int().nullable().describe("Nome do produto, ticker ou ISIN."),
  quantidadeCol: z.number().int().nullable().describe("Número de unidades."),
  precoCol: z.number().int().nullable().describe("Preço por unidade."),
  custoMedioCol: z
    .number()
    .int()
    .nullable()
    .describe("Preço médio de compra, só em listas de posições."),
  valorCol: z
    .number()
    .int()
    .nullable()
    .describe("Valor total da operação ou da posição, na moeda da linha."),
  moedaCol: z
    .number()
    .int()
    .nullable()
    .describe("Código de três letras (USD, EUR). Muitas vezes numa coluna sem cabeçalho."),
  taxaCambioCol: z.number().int().nullable().describe("Taxa de câmbio aplicada."),
  tipoOperacaoCol: z
    .number()
    .int()
    .nullable()
    .describe("Coluna que diz compra/venda. Deixa a null se o sentido estiver no sinal da quantidade."),
  notas: z
    .string()
    .describe("Uma ou duas frases em português a dizer o que percebeste do ficheiro."),
});

const INSTRUCOES = `És um leitor de extratos de corretoras. Recebes as primeiras linhas de um ficheiro e dizes que coluna é o quê.

Devolves índices de colunas, nunca valores. Quem lê os números é o programa.

Como decidir o tipo de ficheiro:
- Se houver uma coluna com datas a sério, uma linha por operação, é "movimentos".
- Se for a lista do que se tem neste momento, sem datas de operação, é "posicoes".
- Se não for nenhuma das duas (um resumo, um extrato bancário, uma fatura), é "nenhum". Preferes dizer "nenhum" a inventar um mapeamento.

Coisas que enganam:
- Os cabeçalhos vêm em português, inglês ou misturados, e nem sempre dizem o que a coluna tem. Olha para os valores das linhas de baixo, não só para o nome.
- A moeda aparece muitas vezes numa coluna **sem cabeçalho nenhum**, logo a seguir ao valor.
- Numa lista de movimentos as vendas costumam vir com quantidade negativa. Se for esse o caso e não houver coluna de compra/venda, deixa tipoOperacaoCol a null: o programa lê o sentido pelo sinal.
- "Preço" e "Valor" são coisas diferentes: preço é por unidade, valor é o total da linha.
- Uma coluna de taxa de câmbio tem números à volta de 1 (1,0912). Uma de valor tem montantes.
- Há ficheiros com linhas de título antes do cabeçalho. linhaCabecalho é a linha dos nomes das colunas, não a primeira do ficheiro.

Se uma coluna não existir no ficheiro, mete null. Não inventes um índice para a preencher.`;

export interface AiMappingResult {
  answer: AiMappingAnswer | null;
  /** Porque é que não deu, quando não dá. Em português, para se poder mostrar. */
  problem: string | null;
}

/** Há chave configurada? Sem ela este caminho não existe e não se anuncia. */
export function aiMappingAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Pede ao modelo o mapeamento das colunas.
 *
 * Devolve sempre um resultado, nunca atira: quem chama trata "não sei" como
 * ausência de resposta e segue para a deteção normal.
 */
export async function readMappingWithAi(grid: Grid): Promise<AiMappingResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { answer: null, problem: "A leitura assistida não está configurada." };
  }
  if (grid.length === 0) {
    return { answer: null, problem: "Ficheiro vazio." };
  }

  const amostra = renderSample(sampleForModel(grid));

  try {
    const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
    const resposta = await client.messages.parse({
      model: MODELO,
      max_tokens: 16_000,
      system: INSTRUCOES,
      // A tarefa é reconhecer colunas numa tabela pequena, não raciocinar sobre
      // o mundo: um esforço médio chega e custa uma fracção do resto.
      output_config: { effort: "medium", format: zodOutputFormat(Resposta) },
      messages: [
        {
          role: "user",
          content: `Primeiras linhas do ficheiro:\n\n${amostra}`,
        },
      ],
    });

    if (resposta.stop_reason === "refusal") {
      return { answer: null, problem: "O modelo recusou ler este ficheiro." };
    }
    const lida = resposta.parsed_output;
    if (!lida) {
      return { answer: null, problem: "Não percebi a resposta do modelo." };
    }
    if (lida.tipo === "nenhum") {
      return {
        answer: null,
        problem: lida.notas || "Isto não me parece um extrato de corretora.",
      };
    }
    return { answer: lida as AiMappingAnswer, problem: null };
  } catch {
    // Rede em baixo, chave inválida, tempo esgotado: nada disto é motivo para
    // estragar a importação. Volta-se ao mapeamento à mão.
    return { answer: null, problem: "Não consegui falar com o serviço de leitura." };
  }
}
