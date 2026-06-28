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

/** Deriva um id estável a partir do email (parte antes do @). */
function slugFromEmail(email: string): string {
  return email.split("@")[0]!.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/**
 * Os dois utilizadores, derivados da allow-list. O primeiro email é o "user A",
 * o segundo o "user B". Nomes capitalizados a partir do slug por defeito.
 */
export function householdUsers(): HouseholdUser[] {
  return allowedEmails().map((email) => {
    const id = slugFromEmail(email);
    const name = id.charAt(0).toUpperCase() + id.slice(1);
    return { id, name, email };
  });
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
