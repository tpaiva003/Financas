/**
 * Resumir os documentos de uma avaliação.
 *
 * **O que a IA faz aqui, e o que não faz.** Lê texto que já foi extraído dos
 * ficheiros e devolve prosa: o que a empresa faz, o que correu bem e mal no
 * período, os riscos, e o que ficou por saber. **Não devolve número nenhum para
 * a app usar.** É a mesma regra da importação — "a IA escolhe colunas, não lê
 * dados" — aplicada a um sítio onde a tentação é maior: seria fácil pedir-lhe o
 * fluxo de caixa livre e enfiá-lo no DCF, e nesse dia o valor por ação passaria
 * a depender de um modelo a ler um PDF. O que entra no cálculo vem da fonte de
 * dados ou do teclado de quem avalia.
 *
 * **O resumo é datado e diz de que ficheiros saiu.** Um resumo sem isso lê-se
 * como o resumo do documento que se carregou agora, e um relatório de 2023 tem
 * ar de actual quando é citado sem data.
 *
 * **Nunca atira.** Sem chave, sem texto, ou com o serviço em baixo, devolve o
 * motivo por extenso e o ecrã diz que não deu.
 */

import Anthropic from "@anthropic-ai/sdk";

const MODELO = "claude-opus-5";
const TIMEOUT_MS = 60_000;

/**
 * Quanto texto vai no pedido.
 *
 * Um relatório anual são centenas de milhares de caracteres e não cabe — nem
 * vale a pena: o que interessa está nas primeiras dezenas de páginas e nas
 * demonstrações. Corta-se por documento e não no total, senão o primeiro
 * ficheiro comia o espaço todo e os outros nunca chegavam a ser lidos.
 */
const MAX_CHARS_POR_DOCUMENTO = 60_000;
const MAX_DOCUMENTOS = 8;

const INSTRUCOES = `És um analista a preparar o estudo de uma empresa para quem vai decidir se investe.

Recebes o texto de documentos que a pessoa carregou: relatórios, apresentações, notas.

Escreve em português de Portugal (pt-PT, nunca brasileiro), em prosa curta, com estes pontos e por esta ordem:

1. **O negócio** — o que a empresa faz e de onde vem o dinheiro. Duas ou três frases.
2. **O período** — o que correu bem e o que correu mal, com os números que os documentos derem, sempre a dizer de que ano ou trimestre são.
3. **Riscos** — o que pode correr mal, incluindo o que a própria empresa admite.
4. **O que fica por saber** — as perguntas a que estes documentos não respondem. Esta secção é obrigatória e é a mais útil: um resumo que dá tudo por esclarecido é pior do que nenhum.

Regras:
- Cita sempre a origem de um número: o ano, o trimestre, o documento. Um número sem data lê-se como sendo de agora.
- Se os documentos se contradisserem, di-lo em vez de escolheres um.
- Não inventes nada. Se uma coisa não estiver no texto, não está no resumo.
- Não dês recomendação de compra nem de venda, e não estimes valor por ação: isso é o trabalho de quem está a avaliar, e o cálculo está noutro sítio da app.
- Sem entusiasmo e sem vender. Frases diretas.`;

export interface DocumentoParaResumir {
  fileName: string;
  texto: string;
}

export interface ResumoResult {
  resumo: string | null;
  /** Quantos documentos entraram mesmo no pedido. */
  usados: number;
  problem: string | null;
}

/** Há chave configurada? Sem ela este caminho não existe e não se anuncia. */
export function resumoAnexosAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function resumirAnexos(
  empresa: string,
  documentos: readonly DocumentoParaResumir[],
): Promise<ResumoResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { resumo: null, usados: 0, problem: "O resumo assistido não está configurado." };
  }

  const uteis = documentos
    .filter((d) => d.texto.trim().length > 200)
    .slice(0, MAX_DOCUMENTOS);
  if (uteis.length === 0) {
    return {
      resumo: null,
      usados: 0,
      // A distinção importa: "não há anexos" e "os anexos são imagens de que
      // não se tirou texto" resolvem-se de maneiras diferentes.
      problem:
        "Não consegui ler texto suficiente nos anexos. Se forem digitalizações ou imagens, não têm texto para eu ler.",
    };
  }

  const corpo = uteis
    .map(
      (d) =>
        `--- Documento: ${d.fileName} ---\n${d.texto.slice(0, MAX_CHARS_POR_DOCUMENTO)}`,
    )
    .join("\n\n");

  try {
    const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
    const resposta = await client.messages.create({
      model: MODELO,
      max_tokens: 2_000,
      system: INSTRUCOES,
      messages: [
        {
          role: "user",
          content: `Empresa: ${empresa}\n\nDocumentos carregados (${uteis.length}):\n\n${corpo}`,
        },
      ],
    });

    const texto = resposta.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    if (!texto) return { resumo: null, usados: uteis.length, problem: "Não veio resposta nenhuma." };
    return { resumo: texto, usados: uteis.length, problem: null };
  } catch {
    return { resumo: null, usados: uteis.length, problem: "Não consegui falar com o serviço." };
  }
}
