/**
 * Pedidos de ajuda: o que um utilizador escreve e o que lhe é respondido.
 *
 * **A regra que manda em tudo o resto: uma nota interna nunca sai.** Um fio de
 * pedido tem duas camadas — o que é dito à pessoa e o que fica escrito para
 * quem trata do assunto ("já se queixou disto três vezes", "provavelmente é o
 * bug da importação"). Se a segunda escorrega para a primeira, não há como
 * desfazer: já foi lida.
 *
 * Por isso a separação não vive num `if` do ecrã. Vive em duas funções de
 * leitura com nomes diferentes, e a que serve o utilizador **não sabe** filtrar
 * — não recebe as internas de todo. Uma bandeira `incluirInternas` seria a
 * mesma coisa até ao dia em que alguém a passasse ao contrário, e esse dia
 * chega sempre.
 *
 * **O estado é para ser visto.** Quem abre um pedido e não vê nada acontecer
 * assume que ninguém leu, e volta a escrever. O estado e cada resposta pública
 * aparecem no fio de quem perguntou, sem ninguém ter de os anunciar.
 *
 * Lógica pura, sem acesso a dados.
 */

export const TICKET_STATUSES = [
  "novo",
  "a-tratar",
  "a-aguardar",
  "resolvido",
  "fechado",
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** O que a pessoa que abriu o pedido lê. Nada de jargão interno. */
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  novo: "Por ler",
  "a-tratar": "A ser tratado",
  "a-aguardar": "À espera de ti",
  resolvido: "Resolvido",
  fechado: "Fechado",
};

/** Uma frase que explica o estado a quem está à espera. */
export const TICKET_STATUS_NOTES: Record<TicketStatus, string> = {
  novo: "Chegou e ainda não foi visto.",
  "a-tratar": "Está a ser tratado.",
  "a-aguardar": "Falta uma resposta tua para continuar.",
  resolvido: "Ficou resolvido. Se não ficou, responde e reabre.",
  fechado: "Este pedido foi encerrado.",
};

/** Os estados em que o pedido ainda conta como aberto. */
export function ticketAberto(status: TicketStatus): boolean {
  return status !== "resolvido" && status !== "fechado";
}

export function isTicketStatus(v: unknown): v is TicketStatus {
  return typeof v === "string" && (TICKET_STATUSES as readonly string[]).includes(v);
}

/** Quanto texto se aceita. Um assunto é uma linha; um corpo é um problema. */
export const TICKET_ASSUNTO_MAX = 120;
export const TICKET_CORPO_MAX = 4000;

export interface NovoTicket {
  assunto: string;
  corpo: string;
}

export interface TicketValidado {
  assunto: string;
  corpo: string;
}

/**
 * Um pedido só vale com assunto e corpo.
 *
 * O assunto é cortado e nunca recusado por comprimento — recusar uma coisa que
 * se pode arranjar sozinho é fazer a pessoa reescrever por nada. O corpo é
 * recusado se estiver vazio, porque aí não há pedido nenhum.
 */
export function validarTicket(input: NovoTicket): { ok: TicketValidado } | { erro: string } {
  const assunto = input.assunto.trim().replace(/\s+/g, " ").slice(0, TICKET_ASSUNTO_MAX);
  const corpo = input.corpo.trim().slice(0, TICKET_CORPO_MAX);
  if (!assunto) return { erro: "Escreve um assunto." };
  if (!corpo) return { erro: "Descreve o que se passa." };
  return { ok: { assunto, corpo } };
}

/**
 * Quem responde muda o estado sem ter de pensar nisso.
 *
 * Uma resposta pública a um pedido "por ler" põe-no "à espera de ti": foi
 * respondido e a bola está do outro lado. Uma resposta de quem perguntou põe-no
 * "a ser tratado", e **reabre** um pedido resolvido — insistir num assunto
 * fechado é a forma mais comum de dizer que ele não estava resolvido.
 *
 * Uma nota interna nunca mexe no estado. Se mexesse, o estado passava a
 * denunciar que houve uma nota interna — e a pessoa via a hora em que alguém
 * escreveu uma coisa que ela não pode ler.
 */
export function estadoDepoisDaResposta(
  atual: TicketStatus,
  autor: "utilizador" | "equipa",
  interna: boolean,
): TicketStatus {
  if (interna) return atual;
  if (autor === "equipa") return atual === "fechado" ? "fechado" : "a-aguardar";
  // O utilizador respondeu.
  if (atual === "fechado") return "fechado";
  return "a-tratar";
}
