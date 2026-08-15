/**
 * Os tokens que dão acesso a definir uma palavra-chave.
 *
 * **Um sítio só, porque são dois os caminhos que os criam.** A reposição de
 * palavra-chave e o convite de acesso emitem o mesmo tipo de token e têm de o
 * guardar exactamente da mesma maneira — se as duas cópias divergissem, um dos
 * caminhos passava a gravar um hash que o outro não reconhece, e a ligação
 * enviada por email deixava de funcionar sem nada se queixar.
 *
 * **O que fica na base de dados é o hash, nunca o token.** Quem leia a tabela
 * não fica com nada que sirva para entrar: o token viaja no email e no endereço,
 * e mais lado nenhum.
 */

import { createHash } from "node:crypto";

/** Uma hora. Tempo para abrir o email, não para deixar a ligação a apodrecer. */
export const TOKEN_VALIDITY_MS = 60 * 60 * 1000;

/** O que fica na base de dados é isto, nunca o token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
