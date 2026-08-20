/**
 * "A IA está ligada?" — sem arrastar o SDK da IA atrás da pergunta.
 *
 * Estas funções viviam cada uma no seu serviço, ao lado do `import Anthropic`.
 * Quem só queria saber se devia mostrar um botão — o layout, o património —
 * pagava o SDK inteiro (11 MB no traço da função serverless) em TODAS as
 * rotas, por causa de um `Boolean(process.env…)`. Aqui não se importa nada.
 *
 * Os serviços mantêm as deles para quem já está dentro de uma action (aí o
 * SDK já foi pago de qualquer forma); quem corre em render de página importa
 * DAQUI.
 */

export function iaDisponivel(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export const conversaAvailable = iaDisponivel;
export const tickerSuggestAvailable = iaDisponivel;
export const creditContractExtractAvailable = iaDisponivel;
export const reciboExtractAvailable = iaDisponivel;
export const resumoAnexosAvailable = iaDisponivel;
export const marcaLookupAvailable = iaDisponivel;
export const aiMappingAvailable = iaDisponivel;
