/**
 * Configuração de autenticação (Auth.js / NextAuth v5).
 *
 * REQ-AUTH:
 *  - Login via SSO: Google (Tiago) e Google ou Microsoft (Clara).
 *  - Allow-list de 2 emails: qualquer outro login é recusado, mesmo com SSO
 *    válido e sem criar conta.
 *  - Sessões persistentes (JWT), com logout manual.
 *
 * Dev: se AUTH_DEV_LOGIN=true, é adicionado um provider de credenciais que
 * permite entrar como um dos emails da allow-list SEM SSO real (apenas para
 * desenvolvimento local — NUNCA em produção). Ver DECISOES.md.
 */

import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { isEmailAllowed, isDevLoginEnabled } from "./env";
import { userByEmail } from "./users";

const providers: NextAuthConfig["providers"] = [
  Google({
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET,
  }),
  MicrosoftEntraID({
    clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
    clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
    issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
  }),
];

if (isDevLoginEnabled()) {
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Dev login (sem SSO)",
      credentials: { email: { label: "Email", type: "email" } },
      authorize: (raw) => {
        const email = typeof raw?.email === "string" ? raw.email.toLowerCase() : "";
        if (!isEmailAllowed(email)) return null;
        const u = userByEmail(email);
        return { id: u?.id ?? email, email, name: u?.name ?? email };
      },
    }),
  );
}

export const authConfig: NextAuthConfig = {
  providers,
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    // Allow-list: barra qualquer email fora da lista, mesmo com SSO válido.
    signIn: ({ user }) => isEmailAllowed(user.email),
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

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
