/**
 * Tectos de tentativas nos formulários públicos.
 *
 * O login, a recuperação, a fila de espera e a caixa de contacto são as quatro
 * portas que qualquer pessoa na internet pode empurrar sem sessão. Sem tecto,
 * o login aceita palavras-chave à velocidade da rede, a recuperação enche a
 * caixa de email de alguém, e os formulários são spam barato.
 *
 * **A chave é o email, não o IP.** O ataque que interessa travar numa app
 * destas é o dirigido — alguém a tentar entrar na conta de uma pessoa que
 * conhece — e esse trava-se por conta visada. Um tecto por IP castigava redes
 * partilhadas (a casa inteira atrás do mesmo NAT) e não custa nada a quem tem
 * muitos IPs. Se um dia houver abuso distribuído, acrescenta-se o IP como
 * segunda chave; hoje seria complexidade à espera de problema.
 *
 * **Falha fechado.** Um limitador que responde "pode" quando a base de dados
 * está em baixo não limita nada exatamente no momento em que ela está em pior
 * estado para aguentar abuso. Recusar por soluço é recuperável: tenta-se a
 * seguir.
 *
 * Os tectos são folgados de propósito: pessoa nenhuma esbarra neles a usar a
 * app — 10 entradas falhadas num quarto de hora já é alguém esquecido da
 * palavra-chave, e a mensagem diz-lhe para esperar em vez de o deixar às
 * escuras.
 */

import { getRepository } from "./data";

export const TECTOS = {
  /** Entradas com palavra-chave, por email visado. */
  login: { janelaMs: 15 * 60_000, tecto: 10 },
  /** Pedidos de recuperação, por email visado: cada um é um email enviado. */
  recuperar: { janelaMs: 60 * 60_000, tecto: 3 },
  /** Inscrições na fila de espera, por email inscrito. */
  waitlist: { janelaMs: 60 * 60_000, tecto: 5 },
  /** Mensagens da caixa de contacto, por email indicado. */
  contacto: { janelaMs: 60 * 60_000, tecto: 5 },
} as const;

export type Escopo = keyof typeof TECTOS;

/**
 * Regista a tentativa e diz se ainda cabe. `false` = recusar já, sem fazer o
 * trabalho do pedido (nem o PBKDF2, nem o email, nem a escrita).
 */
export async function tentativaCabe(escopo: Escopo, identificador: string): Promise<boolean> {
  const { janelaMs, tecto } = TECTOS[escopo];
  const chave = `${escopo}:${identificador.trim().toLowerCase()}`;
  try {
    return await getRepository().registarTentativa(chave, janelaMs, tecto);
  } catch {
    // Falha fechado: ver o cabeçalho.
    return false;
  }
}

/** A frase que os formulários mostram quando o tecto bate. */
export const MENSAGEM_TECTO =
  "Demasiadas tentativas seguidas. Espera uns minutos e tenta outra vez.";
