import { describe, expect, it } from "vitest";
import { isPublicPath } from "./public-routes";

describe("isPublicPath", () => {
  it("a landing e o login são públicos", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
  });

  // O motivo de existirem estes testes: estes quatro estavam privados, e a
  // landing e o login apontavam-lhes na mesma. O link do email de recuperação
  // caía no /login, que é exatamente onde quem se esqueceu não consegue entrar.
  it("a recuperação de palavra-chave é pública, com e sem token", () => {
    expect(isPublicPath("/recuperar")).toBe(true);
    expect(isPublicPath("/recuperar/abc123")).toBe(true);
  });

  // Quem aceita um convite ainda nem conta tem: mandá-lo para o /login é
  // mandá-lo para uma porta que não abre.
  it("a página de aceitar um convite é pública", () => {
    expect(isPublicPath("/convite/abc123")).toBe(true);
    // Sem token não há nada para mostrar: só o [token] é público.
    expect(isPublicPath("/convite")).toBe(false);
  });

  it("as páginas legais são públicas", () => {
    expect(isPublicPath("/privacidade")).toBe(true);
    expect(isPublicPath("/termos")).toBe(true);
  });

  // Um robots.txt atrás de login lê-se como "site sem robots.txt" — e foi
  // assim que ele nasceu: o middleware respondia ao Google com o /login.
  it("os metadados dos motores de busca são públicos", () => {
    expect(isPublicPath("/robots.txt")).toBe(true);
    expect(isPublicPath("/sitemap.xml")).toBe(true);
    expect(isPublicPath("/opengraph-image")).toBe(true);
  });

  it("a app continua privada", () => {
    for (const p of [
      "/dashboard",
      "/despesas",
      "/despesas/123/editar",
      "/saldo",
      "/patrimonio",
      "/ambiente",
      "/plataforma",
      "/relatorios",
    ]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });

  it("um prefixo parecido não abre a porta", () => {
    expect(isPublicPath("/recuperarudo")).toBe(false);
    expect(isPublicPath("/loginha")).toBe(false);
    expect(isPublicPath("/privacidade-interna")).toBe(false);
  });
});
