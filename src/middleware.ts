/**
 * Proteção de rotas (REQ-AUTH-4): tudo o que não seja público exige sessão.
 *
 * Público: /login, a landing futura, ativos estáticos e as rotas de auth.
 * Todo o resto é privado — sem sessão, redireciona para /login.
 */

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isPublic) {
    // Já autenticado a tentar ver /login → manda para o dashboard.
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
  // Corre em tudo menos ativos estáticos, imagens, manifest, service worker e
  // as rotas internas de auth.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)"],
};
