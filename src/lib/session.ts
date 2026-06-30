/**
 * Helpers de sessão para Server Components / Server Actions.
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { userByEmail, type HouseholdUser } from "@/lib/users";
import { getRepository } from "@/lib/data";

/** Devolve o utilizador correspondente à sessão, ou null. */
export async function getCurrentUser(): Promise<HouseholdUser | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  // Utilizadores base (env) primeiro; depois utilizadores adicionais da BD
  // (submitters com login próprio).
  const envUser = userByEmail(email);
  if (envUser) return envUser;
  const dbUser = await getRepository().getAppUserByEmail(email);
  return dbUser ? { id: dbUser.id, name: dbUser.name, email: dbUser.email } : null;
}

/** Exige sessão válida; caso contrário redireciona para /login. */
export async function requireUser(): Promise<HouseholdUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
