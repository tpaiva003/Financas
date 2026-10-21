"use server";

import { z } from "zod";
import { getRepository } from "@/lib/data";
import { MENSAGEM_TECTO, tentativaCabe } from "@/lib/rate-limit";

const schema = z.object({
  name: z.string().trim().max(100).optional(),
  email: z.string().trim().email("Indica um email válido.").max(200),
  message: z.string().trim().min(5, "Escreve uma mensagem um pouco maior.").max(2000),
  consent: z.boolean(),
});

export interface ContactState {
  ok?: boolean;
  error?: string;
}

export async function submitContactAction(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  // Honeypot anti-spam: campo escondido que só os bots preenchem.
  if ((formData.get("company") as string)?.length) {
    return { ok: true };
  }

  const parsed = schema.safeParse({
    name: (formData.get("name") as string) || undefined,
    email: formData.get("email"),
    message: formData.get("message"),
    consent: formData.get("consent") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!parsed.data.consent) {
    return { error: "Aceita a política de privacidade para podermos responder." };
  }

  // Tecto por email indicado: o honeypot apanha bots ingénuos, isto apanha o
  // resto. Vem depois da validação para não gastar janela com pedidos que iam
  // ser recusados de graça.
  if (!(await tentativaCabe("contacto", parsed.data.email))) {
    return { error: MENSAGEM_TECTO };
  }

  try {
    await getRepository().createContactMessage({
      name: parsed.data.name ?? null,
      email: parsed.data.email,
      message: parsed.data.message,
    });
  } catch {
    return { error: "Não foi possível enviar agora. Tenta novamente daqui a pouco." };
  }

  return { ok: true };
}

const waitlistSchema = z.object({
  name: z.string().trim().max(100).optional(),
  email: z.string().trim().email("Indica um email válido.").max(200),
  consent: z.boolean(),
});

export interface WaitlistState {
  ok?: boolean;
  error?: string;
}

/**
 * Entrar na fila de espera do registo.
 *
 * É diferente da caixa de contacto de propósito: a fila é uma lista de emails
 * com consentimento e ordem de chegada, para se convidar quando abrir vaga; a
 * caixa é conversa. Misturá-las (a landing escrevia tudo em `contact_messages`)
 * fazia da fila uma coisa que não se podia percorrer nem convidar por ordem.
 *
 * Insistir não faz subir: o mesmo email fica onde estava, com a data original —
 * a garantia é do repositório, e a resposta aqui é a mesma nos dois casos, para
 * o formulário não servir de oráculo de quem já está na fila.
 */
export async function waitlistAction(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  // O mesmo honeypot do contacto: um campo escondido que só os bots preenchem.
  if ((formData.get("company") as string)?.length) {
    return { ok: true };
  }

  const parsed = waitlistSchema.safeParse({
    name: (formData.get("name") as string) || undefined,
    email: formData.get("email"),
    consent: formData.get("consent") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  // Sem consentimento não há fila: o único fim desta lista é enviar um convite,
  // e sem base legal para o enviar a entrada não serve para nada.
  if (!parsed.data.consent) {
    return { error: "Aceita ser contactado para te podermos avisar quando abrir vaga." };
  }

  // O mesmo tecto do contacto. A resposta do sucesso é igual para email novo e
  // repetido; a do tecto pode ser franca — não diz nada sobre a fila.
  if (!(await tentativaCabe("waitlist", parsed.data.email))) {
    return { error: MENSAGEM_TECTO };
  }

  try {
    await getRepository().addToWaitlist({
      email: parsed.data.email,
      name: parsed.data.name ?? null,
      consent: true,
      // Com tecto: é um campo de telemetria nosso, não uma caixa de texto.
      source: String(formData.get("source") ?? "").trim().slice(0, 60) || "landing",
    });
  } catch {
    return { error: "Não foi possível guardar agora. Tenta novamente daqui a pouco." };
  }

  return { ok: true };
}
