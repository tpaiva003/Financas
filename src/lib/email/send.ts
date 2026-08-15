/**
 * Envio de email, via Resend.
 *
 * Fala com a API por HTTP em vez de usar o SDK: é um pedido só, e não vale uma
 * dependência a mais para o manter atualizado.
 *
 * **Nunca deita a app abaixo.** Se a chave faltar ou o envio falhar, regista-se
 * e segue-se. Um convite que não chega é chato; uma app que rebenta a meio de
 * criar uma conta é pior.
 */

import { renderEmail, renderPlain, type EmailContent } from "./template";

const API = "https://api.resend.com/emails";

export interface SendResult {
  sent: boolean;
  /** Motivo de não ter ido, para mostrar a quem convidou. */
  reason?: string;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(
  to: string,
  subject: string,
  content: EmailContent,
): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    return { sent: false, reason: "Envio de email não está configurado." };
  }

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html: renderEmail(content),
        text: renderPlain(content),
        ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, reason: `Resend respondeu ${res.status}. ${body.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "Falha de rede." };
  }
}

/** Endereço base da app, para as ligações dos emails. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://rachar.pt").replace(/\/$/, "");
}

/**
 * O convite leva a ligação que define a primeira palavra-chave.
 *
 * **Não é "escreve o que quiseres da primeira vez".** Era assim, e isso deixava
 * a conta ao alcance de quem soubesse o email antes de a pessoa entrar. A
 * primeira palavra-chave passa pelo mesmo caminho da reposição — uma ligação
 * com prazo, enviada para aquele endereço — que é o que prova que quem a define
 * é mesmo quem recebe o email.
 */
export async function sendInvite(
  to: string,
  name: string,
  token: string,
): Promise<SendResult> {
  const url = `${siteUrl()}/recuperar/${token}`;
  return sendEmail(to, "Tens acesso à Rachar", {
    heading: `Olá ${name}, já podes entrar.`,
    paragraphs: [
      "Foi-te criado acesso à <strong style=\"color:#f3f2ee\">Rachar</strong>, uma app para registar despesas partilhadas, dividi-las e saber num instante quem deve a quem.",
      `Entra com este email: <strong style="color:#f3f2ee">${to}</strong>.`,
      "Carrega no botão para escolheres a tua palavra-chave. A ligação é válida durante uma hora e só pode ser usada uma vez.",
    ],
    action: { label: "Escolher palavra-chave", url },
    footnote: `Tens um espaço só teu: ninguém vê as tuas contas. Se não estavas à espera deste email, ignora-o. Se o botão não funcionar, copia esta ligação: ${url}`,
  });
}

export async function sendPasswordReset(to: string, token: string): Promise<SendResult> {
  const url = `${siteUrl()}/recuperar/${token}`;
  return sendEmail(to, "Recuperar a palavra-chave da Rachar", {
    heading: "Definir uma palavra-chave nova",
    paragraphs: [
      "Recebemos um pedido para recuperares o acesso à tua conta na Rachar.",
      "Carrega no botão para escolheres uma palavra-chave nova. A ligação é válida durante uma hora e só pode ser usada uma vez.",
    ],
    action: { label: "Escolher palavra-chave", url },
    footnote: `Se não foste tu, ignora este email: a tua palavra-chave atual continua a funcionar e ninguém teve acesso à conta. Se o botão não funcionar, copia esta ligação: ${url}`,
  });
}
