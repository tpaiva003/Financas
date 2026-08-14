/**
 * Que endereços se alcançam sem sessão.
 *
 * Está aqui, fora do `middleware.ts`, para poder ser testado: o middleware
 * arrasta o Auth.js atrás dele e não se corre num teste unitário. E esta lista
 * merece teste — quando estava só lá dentro, faltavam-lhe o `/recuperar` e as
 * páginas legais, e ninguém deu por isso porque a app, para quem já tem sessão,
 * funcionava na mesma.
 *
 * A regra: privado por omissão. Só entra aqui o que tem mesmo de ser lido por
 * alguém que ainda não entrou (ou que já não consegue entrar).
 */

/** Endereços públicos exatos. */
export const PUBLIC_EXACT = [
  "/", // landing
  "/login",
  "/recuperar", // pedir nova palavra-chave
  "/privacidade", // exigida por lei, e a landing aponta-lhe
  "/termos",
] as const;

/**
 * Prefixos públicos.
 *
 * O `/recuperar/` apanha o `/recuperar/[token]`, que é para onde o link do
 * email aponta — é precisamente quem não tem sessão que lá vai parar.
 */
export const PUBLIC_PREFIX = ["/login/", "/recuperar/"] as const;

export function isPublicPath(pathname: string): boolean {
  if ((PUBLIC_EXACT as readonly string[]).includes(pathname)) return true;
  return (PUBLIC_PREFIX as readonly string[]).some((p) => pathname.startsWith(p));
}
