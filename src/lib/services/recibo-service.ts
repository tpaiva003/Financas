/**
 * Ler um recibo e propor a despesa.
 *
 * **A divisão de trabalho é a do contrato de crédito, e é contrato.** O modelo
 * olha para a fotografia e copia o que está impresso — total, data, nome da
 * loja. O código (`domain/recibo.ts`) decide o que disso é utilizável e recusa
 * o resto. A pessoa vê o formulário preenchido e ainda tem de carregar em
 * guardar. Nada entra na base de dados sem esses três passos.
 *
 * **O modelo não faz contas.** Não soma linhas, não calcula IVA, não converte
 * moedas. Copia o total impresso; se o total impresso estiver errado, a pessoa
 * vê-o no formulário — que é exatamente onde um erro se apanha.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";

import { reviewRecibo, type PropostaDeDespesa } from "@/lib/domain/recibo";

const MODELO = "claude-opus-5";
const TIMEOUT_MS = 60_000;

const Resposta = z.object({
  encontrado: z
    .boolean()
    .describe("Isto é mesmo um recibo, fatura ou talão de compra? Falso para tudo o resto."),
  totalEur: z
    .number()
    .nullable()
    .describe(
      "O total efetivamente pago, tal como impresso — depois de descontos, com IVA. Não somes linhas: copia o total. Null se não estiver legível.",
    ),
  moeda: z
    .enum(["EUR", "outra"])
    .nullable()
    .describe('"EUR" se o recibo estiver em euros. Qualquer outra moeda: "outra". Não convertas.'),
  data: z
    .string()
    .nullable()
    .describe("AAAA-MM-DD, tal como impressa no recibo. Null se não estiver legível."),
  comerciante: z
    .string()
    .nullable()
    .describe("O nome da loja ou do emissor, tal como impresso. Sem morada nem NIF."),
  notas: z
    .string()
    .describe("Uma frase em português sobre o que é o documento e o que não deu para ler."),
});

const INSTRUCOES = `Recebes a imagem (ou o texto) de um recibo de compra e copias de lá quatro coisas: o total pago, a moeda, a data e o nome da loja.

Copias o que está impresso. Não calculas nada: não somes as linhas, não apliques descontos tu, não convertas moedas. Se o total impresso não se ler, devolves null — um campo vazio pergunta-se à pessoa, um campo inventado entra nas contas dela.

O total é o que foi efetivamente pago: a linha "Total", depois de descontos e com IVA incluído. Num talão português costuma ser a maior quantia perto do fim.

Se o documento não for um recibo — for um menu, um cartaz, uma fotografia de outra coisa — põe "encontrado" a falso e di-lo nas notas.`;

export interface ReciboExtraido {
  proposta: PropostaDeDespesa | null;
  /** O que o modelo percebeu do documento, para se ver que leu a imagem certa. */
  notas: string;
  problem: string | null;
}

/** Há chave configurada? Sem ela este caminho não existe e não se anuncia. */
export function reciboExtractAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type ReciboInput =
  | { kind: "imagem"; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; dataBase64: string }
  | { kind: "texto"; texto: string };

/**
 * Propõe a despesa a partir do recibo. Devolve sempre, nunca atira. O
 * resultado é para **confirmação** — ver o cabeçalho.
 */
export async function extractRecibo(
  input: ReciboInput,
  hoje: string,
): Promise<ReciboExtraido> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { proposta: null, notas: "", problem: "A leitura de recibos não está configurada." };
  }
  if (input.kind === "texto" && input.texto.trim().length < 20) {
    return {
      proposta: null,
      notas: "",
      problem: "Não consegui tirar texto deste ficheiro. Tira antes uma fotografia ao recibo.",
    };
  }

  try {
    const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
    const resposta = await client.messages.parse({
      model: MODELO,
      max_tokens: 2_000,
      system: INSTRUCOES,
      // Copiar quatro campos de um talão não pede esforço de raciocínio.
      output_config: { effort: "low", format: zodOutputFormat(Resposta) },
      messages: [
        {
          role: "user",
          content:
            input.kind === "imagem"
              ? [
                  {
                    type: "image" as const,
                    source: {
                      type: "base64" as const,
                      media_type: input.mediaType,
                      data: input.dataBase64,
                    },
                  },
                ]
              : `Texto do recibo:\n\n${input.texto.slice(0, 20_000)}`,
        },
      ],
    });

    if (resposta.stop_reason === "refusal") {
      return { proposta: null, notas: "", problem: "O modelo recusou ler este documento." };
    }
    const lida = resposta.parsed_output;
    if (!lida) {
      return { proposta: null, notas: "", problem: "Não percebi a resposta do modelo." };
    }

    const revisto = reviewRecibo(lida, hoje);
    return { proposta: revisto.proposta, notas: lida.notas ?? "", problem: revisto.problema };
  } catch {
    return { proposta: null, notas: "", problem: "Não consegui falar com o serviço." };
  }
}
