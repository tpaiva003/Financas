"use server";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { getRepository } from "@/lib/data";
import { userByEmail } from "@/lib/users";
import { hashPassword, passwordIssue } from "@/lib/password";
import { sendPasswordReset } from "@/lib/email/send";

export interface ResetState {
  error?: string;
  ok?: boolean;
  message?: string;
}

/** O que fica na base de dados é isto, nunca o token. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const TOKEN_VALIDITY_MS = 60 * 60 * 1000; // uma hora

/**
 * Pedir a recuperação.
 *
 * Responde SEMPRE a mesma coisa, exista a conta ou não. Dizer "esse email não
 * está registado" transformaria este formulário numa forma de descobrir quem
 * usa a app, o que numa app de finanças partilhadas não é inofensivo.
 */
export async function requestPasswordResetAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const resposta: ResetState = {
    ok: true,
    message: "Se essa conta existir, enviámos um email com as instruções.",
  };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return resposta;

  const repo = getRepository();
  const user = userByEmail(email) ?? (await repo.getAppUserByEmail(email).catch(() => null));
  if (!user) return resposta;

  const token = randomBytes(32).toString("base64url");
  try {
    await repo.createPasswordResetToken({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_VALIDITY_MS).toISOString(),
    });
    await sendPasswordReset(email, token);
  } catch {
    // Mesmo a falhar, a resposta é igual, pelo motivo acima.
  }
  return resposta;
}

/** Definir a palavra-chave nova a partir do token do email. */
export async function completePasswordResetAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const issue = passwordIssue(password);
  if (issue) return { error: issue };
  if (password !== confirm) return { error: "As palavras-chave não coincidem." };

  const repo = getRepository();
  const found = await repo.consumePasswordResetToken(hashToken(token)).catch(() => null);
  if (!found) {
    return { error: "Esta ligação já foi usada ou expirou. Pede outra." };
  }

  await repo.setUserPasswordHash(found.userId, await hashPassword(password));
  redirect("/login?recuperada=1");
}
