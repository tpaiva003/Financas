/**
 * Proteção de rotas (REQ-AUTH-4): tudo o que não seja público exige sessão.
 *
 * Público: a landing (/), o login, a submissão de contacto, ativos estáticos e
 * as rotas de auth. Todo o resto é privado. Usa a config edge-safe.
 */

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_EXACT = ["/", "/login"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    PUBLIC_EXACT.includes(pathname) || pathname.startsWith("/login/");

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
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)"],
};
