/**
 * Autenticação completa (runtime Node) — usada pelo route handler e pelo servidor.
 *
 * REQ-AUTH:
 *  - SSO Google + Microsoft com allow-list de 2 emails (ver auth.config.ts).
 *  - Login por PALAVRA-CHAVE (interim, enquanto o SSO não está ligado): na 1.ª
 *    entrada de cada utilizador, a palavra-chave que ele escrever fica definida;
 *    nas seguintes é validada. Substitui o "Modo de desenvolvimento".
 *  - Dev-login (AUTH_DEV_LOGIN=true) entra sem palavra-chave. Só para dev local.
 */

import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { userByEmail } from "./users";
import { hashPassword, verifyPassword, passwordIssue } from "./password";
import { getRepository } from "./data";

const providers: NextAuthConfig["providers"] = [...authConfig.providers];

providers.push(
  Credentials({
    id: "password",
    name: "Palavra-chave",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Palavra-chave", type: "password" },
    },
    authorize: async (raw) => {
      const email = typeof raw?.email === "string" ? raw.email.toLowerCase() : "";
      const password = typeof raw?.password === "string" ? raw.password : "";
      if (passwordIssue(password)) return null;

      const repo = getRepository();
      // Allow-list: utilizadores base (env) OU utilizadores adicionais da BD
      // (submitters a quem o admin deu acesso). Mais ninguém entra.
      const u = userByEmail(email) ?? (await repo.getAppUserByEmail(email));
      if (!u) return null;

      const existing = await repo.getUserPasswordHash(u.id);
      if (!existing) {
        // Primeira entrada: define a palavra-chave.
        await repo.setUserPasswordHash(u.id, await hashPassword(password));
        return { id: u.id, email: u.email, name: u.name };
      }
      const ok = await verifyPassword(password, existing);
      return ok ? { id: u.id, email: u.email, name: u.name } : null;
    },
  }),
);

export const { handlers, auth, signIn, signOut } = NextAuth({ ...authConfig, providers });
