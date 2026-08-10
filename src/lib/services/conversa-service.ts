/**
 * Conversar sobre a situação financeira.
 *
 * **A divisão de trabalho é a de sempre nesta app.** Os números vêm todos
 * calculados de código com testes (`buildSituacao`), já em euros. O modelo
 * recebe esse resumo e discute-o: explica o que significa, compara, aponta o
 * que salta à vista, responde a perguntas. **Não soma, não projeta, não calcula
 * rendibilidades** — e é-lhe dito que, se para responder fizer falta uma conta
 * que não está no resumo, diga que não tem esse número em vez de o produzir.
 *
 * A razão é a de sempre: "a tua taxa de poupança é 34%" é exatamente o tipo de
 * frase em que ninguém desconfia. Um número errado com ar de resposta é pior do
 * que erro nenhum.
 *
 * **O que sai daqui para fora.** O resumo — totais, taxas, prestações, médias
 * por categoria — e as mensagens da conversa. Não vai o extrato, não vão as
 * notas dos bens, não vão nomes de pessoas. A conversa **não fica guardada**:
 * vive na página e desaparece quando ela fecha.
 *
 * **Isto não é aconselhamento financeiro**, e o modelo é instruído a dizê-lo
 * quando a pergunta pedir uma decisão de investimento ou de crédito.
 */

import Anthropic from "@anthropic-ai/sdk";

import { situacaoParaTexto, type Situacao } from "@/lib/domain";

const MODELO = "claude-opus-5";
const TIMEOUT_MS = 90_000;
/** Quantas mensagens da conversa se mandam de volta. Chega para o contexto. */
const MAX_HISTORICO = 20;
const MAX_CHARS_MENSAGEM = 2_000;

export type Papel = "user" | "assistant";

export interface MensagemConversa {
  role: Papel;
  content: string;
}

const INSTRUCOES = `Conversas com uma pessoa sobre as finanças dela, em português de Portugal. Recebes um resumo da situação financeira, já calculado pela aplicação.

REGRA PRINCIPAL: os números são os do resumo. Não os recalculas, não os projetas no tempo, não estimas rendibilidades futuras nem valores que não estejam lá. Comparar dois números do resumo, ou dizer que um é cerca de metade do outro, é conversa normal. Produzir um número novo com ar de resultado — uma projeção a dez anos, uma poupança total de uma amortização, uma rendibilidade — não é: nesse caso dizes que não tens esse cálculo e, se a aplicação o fizer noutro sítio (a calculadora FIRE, o plano do crédito), apontas para lá.

Se te perguntarem uma coisa que o resumo não diz, dizes que não sabes. Não estimes com base em médias nacionais nem no que é habitual: a pessoa está a olhar para os números dela e uma média inventada passaria por número dela.

Como falas:
- Direto e curto. Duas ou três frases costumam chegar. Sem listas com dez pontos.
- Sem entusiasmo forçado e sem sermões sobre poupar. A pessoa sabe o que gasta.
- Dizes o que salta à vista, incluindo o que não é agradável — uma prestação que vai subir, uma dívida cara ao lado de dinheiro parado — mas uma vez, sem repetir.
- Números sempre como estão no resumo, em euros.

O resumo traz também o saldo entre as pessoas do ambiente — quem tem a receber, quem tem a pagar, e os pagamentos mínimos que zerariam tudo. Metade desta app é despesa partilhada, por isso "quem me deve o quê?" é uma pergunta normal e respondes-lhe pelos nomes que estão no resumo.

Quando o resumo disser em que página a pessoa está, usa isso para lhe falares do que ela tem à frente, e para lhe dizeres onde é que uma coisa se vê ou se muda. Não o menciones se não vier a propósito.

Limites:
- Isto não é aconselhamento financeiro. Quando a pergunta for mesmo uma decisão de investimento, de crédito ou de fiscalidade, respondes com o que se sabe do resumo e dizes com franqueza que a decisão precisa de alguém habilitado.
- Não sabes nada de fora do resumo sobre esta pessoa. Não perguntes por dados que não tens; trabalha com o que está lá.`;

export interface ConversaResult {
  reply: string | null;
  problem: string | null;
}

/** Há chave configurada? Sem ela este caminho não existe e não se anuncia. */
export function conversaAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Limpa o histórico que veio do cliente.
 *
 * O que chega do formulário não é prova de nada: corta-se o tamanho, garante-se
 * que os papéis alternam a começar em `user` — que é o que a API exige — e
 * fica-se pelas últimas mensagens.
 */
export function limparHistorico(raw: readonly unknown[]): MensagemConversa[] {
  const limpas: MensagemConversa[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    if (m.role !== "user" && m.role !== "assistant") continue;
    const content = typeof m.content === "string" ? m.content.trim().slice(0, MAX_CHARS_MENSAGEM) : "";
    if (!content) continue;
    // Duas do mesmo lado seguidas seriam recusadas pela API. Fica a última.
    if (limpas.length > 0 && limpas[limpas.length - 1]!.role === m.role) {
      limpas[limpas.length - 1] = { role: m.role, content };
      continue;
    }
    limpas.push({ role: m.role, content });
  }
  const cortadas = limpas.slice(-MAX_HISTORICO);
  // A conversa tem de começar do lado de quem pergunta.
  while (cortadas.length > 0 && cortadas[0]!.role !== "user") cortadas.shift();
  return cortadas;
}

/**
 * Uma resposta à conversa. Devolve sempre, nunca atira.
 */
export async function conversar(
  situacao: Situacao,
  historico: readonly MensagemConversa[],
): Promise<ConversaResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { reply: null, problem: "A conversa assistida não está configurada." };

  const mensagens = limparHistorico(historico);
  if (mensagens.length === 0) return { reply: null, problem: "Escreve uma pergunta." };

  try {
    const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
    const resposta = await client.messages.create({
      model: MODELO,
      max_tokens: 1_500,
      system: [
        { type: "text" as const, text: INSTRUCOES },
        {
          type: "text" as const,
          text: `Resumo da situação financeira desta pessoa, calculado pela aplicação:\n\n${situacaoParaTexto(situacao)}`,
        },
      ],
      messages: mensagens.map((m) => ({ role: m.role, content: m.content })),
    });

    const texto = resposta.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    if (!texto) return { reply: null, problem: "Não veio resposta nenhuma." };
    return { reply: texto, problem: null };
  } catch {
    return { reply: null, problem: "Não consegui falar com o serviço." };
  }
}
