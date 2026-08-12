/**
 * Proteção de rotas (REQ-AUTH-4): tudo o que não seja público exige sessão.
 *
 * Público: a landing (/), o login, a submissão de contacto, ativos estáticos e
 * as rotas de auth. Todo o resto é privado. Usa a config edge-safe.
 *
 * `api/cron` fica de fora porque quem lhe bate é a Vercel, não um browser com
 * sessão. Não é uma porta aberta: essa rota exige o `CRON_SECRET` e não lê nem
 * devolve dados de ninguém, só enche a cache de cotações, que são públicas.
 */

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Páginas que têm mesmo de abrir sem sessão.
 *
 * A `/recuperar` é o caso que mais depressa se percebe: quem perdeu a
 * palavra-chave não pode ter de entrar para a repor. As `/privacidade` e
 * `/termos` estão aqui pela mesma razão por que existem, a Google exige-as
 * acessíveis sem sessão para aprovar o ecrã de consentimento do SSO, e o
 * rodapé da landing aponta para as duas.
 */
const PUBLIC_EXACT = ["/", "/login", "/privacidade", "/termos", "/recuperar"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    PUBLIC_EXACT.includes(pathname) ||
    pathname.startsWith("/login/") ||
    // O link de reposição traz o código no caminho: /recuperar/<token>.
    pathname.startsWith("/recuperar/");

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
  // `landing/` são as capturas de ecrã da página pública, e os ícones são
  // pedidos pelo browser antes de haver sessão nenhuma. Passar por aqui punha
  // o middleware a responder-lhes com um redirecionamento para o login, que é
  // o que estragava as imagens da landing.
  matcher: [
    "/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|landing/|icon.svg|apple-icon.svg).*)",
  ],
};
