/**
 * Autenticação completa (runtime Node), usada pelo route handler e pelo servidor.
 *
 * Como se entra HOJE:
 *  - **Palavra-chave.** É o único caminho que a interface oferece. Na 1.ª
 *    entrada de cada conta, a palavra-chave que for escrita fica definida; nas
 *    seguintes é validada. Isto é uma dívida conhecida — quem chegar primeiro a
 *    um email conhecido fica com a conta — e está registada no `RETOMAR.md`.
 *  - **Google e Microsoft** estão configurados no `auth.config.ts` mas **não têm
 *    botão em lado nenhum**. Não é só falta de credenciais: falta a UI.
 *  - O "Modo de desenvolvimento" já não existe. A `AUTH_DEV_LOGIN` foi removida
 *    porque a função que a lia não tinha chamadores — defini-la não fazia nada,
 *    e uma variável que promete um comportamento que não acontece é pior do que
 *    variável nenhuma.
 */

import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { randomUUID } from "node:crypto";
import { authConfig } from "./auth.config";
import { userByEmail } from "./users";
import { isEmailAllowed, isOpenRegistrationEnabled } from "./env";
import { canSignIn } from "./domain";
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

/**
 * Quem pode entrar, decidido aqui e não em `auth.config.ts`.
 *
 * A verificação precisa de consultar a base de dados (as contas criadas na app
 * não vivem em variáveis de ambiente) e o `auth.config.ts` corre no edge, onde
 * não há acesso a dados. Este ficheiro corre em Node, que é onde o início de
 * sessão acontece de facto.
 */
const signInCallback: NonNullable<NextAuthConfig["callbacks"]>["signIn"] = async ({
  user,
  account,
}) => {
  const provider = account?.provider ?? "password";
  const email = (user.email ?? "").toLowerCase();
  if (!email) return false;

  const repo = getRepository();
  const existing = userByEmail(email) ?? (await repo.getAppUserByEmail(email).catch(() => null));

  const allowed = canSignIn({
    provider,
    isEnvAllowed: isEmailAllowed(email),
    hasAccount: Boolean(existing),
    openRegistration: isOpenRegistrationEnabled(),
  });
  if (!allowed) return false;

  // Registo aberto e primeira entrada por SSO: cria-se a conta agora. O
  // ambiente próprio nasce no primeiro acesso (ver `getSpaceContext`), com a
  // pessoa sozinha lá dentro.
  if (provider !== "password" && !existing) {
    await repo
      .createAppUser({
        id: `usr_${randomUUID()}`,
        email,
        name: user.name?.trim() || email.split("@")[0]!,
      })
      .catch(() => {
        // Se a criação falhar, deixamos entrar na mesma: o pior que acontece é
        // a conta ser criada na visita seguinte.
      });
  }

  return true;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  callbacks: { ...authConfig.callbacks, signIn: signInCallback },
});
