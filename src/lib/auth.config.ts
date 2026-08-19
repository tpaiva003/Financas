/**
 * Configuração base de autenticação, segura para o edge (usada pelo middleware).
 *
 * Só inclui o que o MIDDLEWARE precisa: callbacks sem acesso a DB nem a
 * crypto de Node. Os providers vivem todos em `auth.ts` (runtime Node) — os
 * OAuth também: o middleware corre em TODOS os pedidos e só decifra a sessão,
 * nunca inicia um login, por isso carregá-los aqui era peso morto no bundle
 * edge de cada pedido.
 */

import type { NextAuthConfig } from "next-auth";
import { isEmailAllowed } from "./env";
import { userByEmail } from "./users";

export const authConfig: NextAuthConfig = {
  providers: [],
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
