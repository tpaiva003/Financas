/**
 * Identidade dos dois utilizadores do agregado.
 *
 * O id estável (slug) é usado em todo o domínio (payerId, ownerId, etc.). O
 * mapeamento email→utilizador resolve-se a partir da allow-list.
 */

import { allowedEmails } from "./env";

export interface HouseholdUser {
  id: string;
  name: string;
  email: string;
}

/**
 * Perfis fixos dos dois utilizadores. Os ids (`tiago`/`clara`) são estáveis e
 * são a fonte de verdade usada em todo o domínio E na base de dados
 * (`app_users.id`, `expenses.payer_id`, etc.). Os EMAILS vêm da allow-list
 * (`ALLOWED_EMAILS`), por ordem: o 1.º email é o do Tiago, o 2.º o da Clara.
 * Assim, mudar os emails reais não parte a ligação às linhas já existentes.
 */
const PROFILES: { id: string; name: string }[] = [
  { id: "tiago", name: "Tiago" },
  { id: "clara", name: "Clara" },
];

export function householdUsers(): HouseholdUser[] {
  const emails = allowedEmails();
  return PROFILES.map((p, i) => ({
    id: p.id,
    name: p.name,
    email: emails[i] ?? `${p.id}@example.com`,
  }));
}

export function userByEmail(email: string | null | undefined): HouseholdUser | undefined {
  if (!email) return undefined;
  return householdUsers().find((u) => u.email === email.toLowerCase());
}

export function userById(id: string): HouseholdUser | undefined {
  return householdUsers().find((u) => u.id === id);
}

export function partnerOf(id: string): HouseholdUser | undefined {
  return householdUsers().find((u) => u.id !== id);
}

/** O admin é o primeiro utilizador (Tiago): recebe as mensagens de contacto. */
export function adminUser(): HouseholdUser {
  return householdUsers()[0]!;
}

export function isAdmin(id: string): boolean {
  return adminUser().id === id;
}
