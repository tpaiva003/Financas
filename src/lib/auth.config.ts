/**
 * Configuração base de autenticação, segura para o edge (usada pelo middleware).
 *
 * Só inclui o que corre no edge: providers OAuth e callbacks sem acesso a DB
 * nem a crypto de Node. Os providers de credenciais (palavra-chave, dev-login),
 * que precisam de DB/crypto, são adicionados em `auth.ts` (runtime Node).
 */

import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { isEmailAllowed } from "./env";
import { userByEmail } from "./users";

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
  ],
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    // Allow-list: barra qualquer email fora da lista no SSO. O login por
    // palavra-chave já é validado em `authorize()` (env + utilizadores da BD).
    signIn: ({ user, account }) =>
      account?.provider === "password" ? true : isEmailAllowed(user.email),
    jwt: ({ token }) => {
      if (token.email) {
        const u = userByEmail(token.email);
        if (u) token.householdUserId = u.id;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        session.user.householdUserId =
          (token.householdUserId as string | undefined) ??
          userByEmail(session.user.email)?.id;
      }
      return session;
    },
  },
};
