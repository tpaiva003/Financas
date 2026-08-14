/**
 * Ler o contrato do crédito à habitação e propor os campos.
 *
 * **O problema.** Registar um crédito à habitação à mão é escrever o montante,
 * a data da escritura, o prazo, a data do último pagamento e dois ou três
 * períodos de taxa com indexante e spread — tudo à procura em trinta páginas de
 * escritura escritas para um notário. É trabalho chato o suficiente para se
 * fazer de qualquer maneira, e um crédito registado de qualquer maneira dá uma
 * prestação errada durante trinta anos.
 *
 * **A divisão de trabalho, como em toda a app.** O modelo procura e propõe; o
 * código verifica e recusa; a pessoa confirma. Nada do que sai daqui é gravado
 * sozinho — vai preencher um formulário que ainda tem de ser submetido.
 *
 * **O modelo não faz contas.** É-lhe pedido que copie os números que estão
 * escritos, não que calcule prazos, prestações ou datas de fim. As contas ficam
 * do lado do `reviewContrato`, que recalcula a prestação a partir do capital, da
 * taxa e do prazo e a compara com a que o contrato imprime. É essa conta, e não
 * a confiança no modelo, que faz uma vírgula fora do sítio dar nas vistas.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";

import { reviewContrato, type ContratoRevisto } from "@/lib/domain";

const MODELO = "claude-opus-5";
const TIMEOUT_MS = 120_000;

/**
 * Quanto texto do contrato vai ao modelo. Uma escritura são dezenas de
 * páginas, e o que interessa está quase sempre nas condições particulares, no
 * princípio. Quando não cabe, leva-se o princípio e o fim — as taxas por
 * períodos costumam vir em anexo — e diz-se que se cortou pelo meio, em vez de
 * cortar a cauda em silêncio e ficar sem o anexo sem ninguém saber.
 */
const MAX_CHARS = 120_000;
const CABECA = 80_000;
const CAUDA = 40_000;

const Periodo = z.object({
  inicioMesDoContrato: z
    .number()
    .nullable()
    .describe(
      "Quantos meses depois do início do contrato este período começa. 0 para o primeiro. Só se o contrato disser a duração dos períodos ('nos primeiros 36 meses'). Caso contrário null.",
    ),
  dataInicio: z
    .string()
    .nullable()
    .describe("AAAA-MM-DD, só se o contrato der a data por extenso. Caso contrário null."),
  tipo: z.enum(["fixa", "variavel"]).describe("Taxa fixa ou indexada à Euribor."),
  taxaPct: z
    .number()
    .nullable()
    .describe("A TAN anual em percentagem, só nos períodos de taxa fixa. 3.3 para 3,30%."),
  indexante: z
    .enum(["euribor3m", "euribor6m", "euribor12m"])
    .nullable()
    .describe("Só nos períodos de taxa variável."),
  spreadPct: z
    .number()
    .nullable()
    .describe("A margem do banco em pontos percentuais, só nos variáveis. 0.9 para 0,9%."),
});

const Resposta = z.object({
  capitalEur: z
    .number()
    .nullable()
    .describe("O montante emprestado, em euros. Não o valor da casa nem o que já foi pago."),
  dataInicio: z
    .string()
    .nullable()
    .describe("AAAA-MM-DD. A data da escritura ou do início do contrato."),
  dataMaturidade: z
    .string()
    .nullable()
    .describe("AAAA-MM-DD do último pagamento, só se o contrato a disser. Não a calcules."),
  prazoMeses: z.number().nullable().describe("O prazo total em meses, tal como está escrito."),
  prestacaoInicialEur: z
    .number()
    .nullable()
    .describe(
      "A primeira prestação mensal em euros, tal como está escrita. É com ela que o programa confere o resto — copia-a mesmo que pareça não bater certo.",
    ),
  periodos: z.array(Periodo).describe("Por ordem no tempo. Vazio se não conseguires apurar nenhum."),
  encontrado: z
    .boolean()
    .describe("Isto é mesmo um contrato de crédito com garantia hipotecária ou parecido?"),
  notas: z
    .string()
    .describe("Uma ou duas frases em português sobre o que é o documento e o que não deu para tirar."),
});

const INSTRUCOES = `Recebes o texto de um contrato de crédito à habitação português e copias de lá os dados do empréstimo.

Copias o que está escrito. Não calculas nada: não somes prazos, não deduzas a data do último pagamento a partir do início, não converte anos em meses se o contrato já disser meses, e não estimes uma prestação. Um programa faz essas contas a seguir, e compara-as com o que copiaste — é assim que um erro de leitura é apanhado. Se calculares em vez de copiares, a comparação deixa de servir para nada.

Quando um dado não estiver no documento, devolves null. Nunca preenchas por parecer provável: um campo vazio pergunta-se a quem carregou o ficheiro, um campo inventado fica lá trinta anos.

O que costuma aparecer:
- O montante vem como "capital mutuado", "montante do empréstimo" ou "quantia mutuada". Não confundas com o valor de avaliação do imóvel, que costuma vir logo ao lado e é maior.
- O prazo vem em meses ou em anos ("pelo prazo de 360 meses", "trinta anos"). Se vier em anos, devolve os anos vezes doze — isso é conversão de unidades, não é uma conta.
- As taxas vêm por períodos: "durante os primeiros 24 meses, à taxa fixa de 3,30%", "findo esse prazo, à Euribor a 6 meses acrescida de um spread de 0,90%". Cada um desses é um período.
- Num crédito só de taxa variável há um único período, a começar no mês 0.
- O spread também aparece como "margem", "acrescida de" ou "bonificação".
- A Euribor pode vir escrita como "Euribor 6M", "Euribor a seis meses" ou "taxa de referência".

Coisas que enganam:
- O valor da Euribor à data da escritura está quase sempre lá ("Euribor a 6 meses em vigor: 2,532%"). Não o devolvas em lado nenhum: não é o spread, e o programa não o quer.
- A TAEG não é a TAN. A TAEG inclui seguros e comissões e é sempre maior. O que se pede é a TAN.
- Uma prestação com seguros incluídos é maior do que a do crédito. Copia a que estiver identificada como prestação do empréstimo; se só houver uma, copia essa.
- Há contratos com carência de capital no princípio. Se houver, di-lo nas notas.
- Se o documento não for um contrato de crédito — for uma simulação, uma caderneta predial, um extrato — põe "encontrado" a falso e explica nas notas.`;

export interface CreditContractResult {
  revisto: ContratoRevisto | null;
  /** O que o modelo percebeu do documento, para se ver que leu o ficheiro certo. */
  notas: string;
  problem: string | null;
}

/** Há chave configurada? Sem ela este caminho não existe e não se anuncia. */
export function creditContractExtractAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** O texto que vai ao modelo, cortado pelo meio quando não cabe. */
export function trimContractText(texto: string): string {
  if (texto.length <= MAX_CHARS) return texto;
  return `${texto.slice(0, CABECA)}\n\n[…texto do meio do documento cortado por ser demasiado longo…]\n\n${texto.slice(-CAUDA)}`;
}

/**
 * Propõe os campos do crédito a partir do texto do contrato.
 *
 * Devolve sempre, nunca atira. O resultado é para **confirmação** — ver o
 * cabeçalho.
 */
export async function extractCreditContract(texto: string): Promise<CreditContractResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { revisto: null, notas: "", problem: "A leitura assistida não está configurada." };
  }

  const limpo = (texto ?? "").trim();
  // Um PDF digitalizado é uma imagem: sai daqui sem texto nenhum, e dizê-lo é
  // muito melhor do que mandar uma folha em branco ao modelo e culpar a leitura.
  if (limpo.length < 200) {
    return {
      revisto: null,
      notas: "",
      problem:
        "Não consegui tirar texto deste ficheiro. Se for digitalizado, é uma imagem e não tem texto para ler.",
    };
  }

  try {
    const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
    const resposta = await client.messages.parse({
      model: MODELO,
      max_tokens: 8_000,
      system: INSTRUCOES,
      // Encontrar cinco dados no meio de trinta páginas dá trabalho a sério.
      output_config: { effort: "medium", format: zodOutputFormat(Resposta) },
      messages: [{ role: "user", content: `Texto do contrato:\n\n${trimContractText(limpo)}` }],
    });

    if (resposta.stop_reason === "refusal") {
      return { revisto: null, notas: "", problem: "O modelo recusou ler este documento." };
    }
    const lida = resposta.parsed_output;
    if (!lida) {
      return { revisto: null, notas: "", problem: "Não percebi a resposta do modelo." };
    }
    if (!lida.encontrado) {
      return {
        revisto: null,
        notas: lida.notas ?? "",
        problem: lida.notas || "Isto não me parece um contrato de crédito.",
      };
    }

    return { revisto: reviewContrato(lida), notas: lida.notas ?? "", problem: null };
  } catch {
    return { revisto: null, notas: "", problem: "Não consegui falar com o serviço." };
  }
}
