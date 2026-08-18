"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getRepository } from "@/lib/data";
import { hashToken } from "@/lib/tokens";
import { hashPassword, passwordIssue } from "@/lib/password";

export interface ConviteState {
  error?: string;
}

/**
 * Aceitar um convite de submissão: é AQUI que a conta nasce.
 *
 * Quem convidou só deixou um convite; quem aceita é que cria a conta e escolhe
 * a palavra-chave — essa é a diferença entre um convite e uma conta feita em
 * nome de outra pessoa. Sem sessão, de propósito: quem chega por este link
 * ainda não tem como ter uma.
 *
 * A palavra-chave valida-se ANTES de consumir o token: um engano a escrever
 * não pode queimar uma ligação de uso único.
 */
export async function acceptMemberInviteAction(
  _prev: ConviteState,
  formData: FormData,
): Promise<ConviteState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const issue = passwordIssue(password);
  if (issue) return { error: issue };
  if (password !== confirm) return { error: "As palavras-chave não coincidem." };

  const repo = getRepository();
  const convite = await repo.acceptMemberInvite(hashToken(token)).catch(() => null);
  if (!convite) {
    return { error: "Este convite já foi usado, foi cancelado ou expirou. Pede um novo a quem te convidou." };
  }

  // O participante pode ter sido eliminado, ou ter ganho acesso por outra via,
  // entre o envio e o aceite. Nesses casos não há nada para ligar — e criar uma
  // conta órfã seria pior do que recusar.
  const member = (await repo.listMembers(convite.spaceId).catch(() => [])).find(
    (m) => m.id === convite.memberId,
  );
  if (!member || member.linkedUserId) {
    return { error: "Este convite já não é válido: fala com quem te convidou." };
  }
  if (await repo.getAppUserByEmail(convite.email).catch(() => null)) {
    return { error: "Já existe uma conta com este email. Entra com ela, ou recupera a palavra-chave." };
  }

  const userId = `usr_${randomUUID()}`;
  await repo.createAppUser({ id: userId, email: convite.email, name: member.name });
  await repo.setUserPasswordHash(userId, await hashPassword(password));
  await repo.updateMember(convite.memberId, convite.spaceId, {
    role: "submitter",
    linkedUserId: userId,
    email: convite.email,
  });

  redirect("/login?convite=aceite");
}
