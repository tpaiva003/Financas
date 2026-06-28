/**
 * Helpers de sessão para Server Components / Server Actions.
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { userByEmail, type HouseholdUser } from "@/lib/users";

/** Devolve o utilizador do agregado correspondente à sessão, ou null. */
export async function getCurrentUser(): Promise<HouseholdUser | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  return userByEmail(email) ?? null;
}

/** Exige sessão válida; caso contrário redireciona para /login. */
export async function requireUser(): Promise<HouseholdUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
