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

  it("as páginas legais são públicas", () => {
    expect(isPublicPath("/privacidade")).toBe(true);
    expect(isPublicPath("/termos")).toBe(true);
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
