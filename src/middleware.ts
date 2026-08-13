/**
 * Proteção de rotas (REQ-AUTH-4): tudo o que não seja público exige sessão.
 *
 * A lista do que é público está em `lib/public-routes.ts`, para ser testável —
 * aqui dentro não era, e faltavam-lhe a recuperação de palavra-chave e as
 * páginas legais sem que nada se queixasse.
 *
 * `api/cron` fica de fora do matcher porque quem lhe bate é a Vercel, não um
 * browser com sessão. Não é uma porta aberta: essa rota exige o `CRON_SECRET`
 * (e recusa quando ele não está definido) e não lê nem devolve dados de
 * ninguém, só enche a cache de cotações, que são públicas.
 */

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { isPublicPath } from "@/lib/public-routes";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = isPublicPath(pathname);

  if (isPublic) {
    if (req.auth && pathname === "/login") {
      return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
    }
    return NextResponse.next();
  }

  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)",
  ],
};
