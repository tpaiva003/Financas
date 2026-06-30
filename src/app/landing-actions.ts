"use server";

import { z } from "zod";
import { getRepository } from "@/lib/data";

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
