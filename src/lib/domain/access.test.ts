import { describe, expect, it } from "vitest";
import { canSignIn, decideAccess, type AccessInput } from "./access";

const base: AccessInput = {
  provider: "google",
  isEnvAllowed: false,
  hasAccount: false,
  openRegistration: false,
};

describe("decideAccess, SSO", () => {
  it("deixa entrar os donos da casa (lista das variáveis)", () => {
    const d = decideAccess({ ...base, isEnvAllowed: true });
    expect(d).toEqual({ allow: true, reason: "env" });
  });

  it("deixa entrar quem já tem conta na app", () => {
    // Este era o defeito: uma pessoa convidada entrava por palavra-chave mas
    // era barrada no SSO, porque a verificação só olhava para as variáveis de
    // ambiente e não conhecia as contas da base de dados.
    const d = decideAccess({ ...base, hasAccount: true });
    expect(d).toEqual({ allow: true, reason: "conta" });
  });

  it("barra quem não foi convidado", () => {
    expect(decideAccess(base)).toEqual({ allow: false, reason: "sem-convite" });
  });

  it("com registo aberto, deixa entrar qualquer pessoa", () => {
    const d = decideAccess({ ...base, openRegistration: true });
    expect(d).toEqual({ allow: true, reason: "registo-aberto" });
  });

  it("o registo está fechado por omissão", () => {
    // Abrir o registo tem de ser uma decisão tomada, não um descuido de
    // configuração: sem o sinal explícito, ninguém novo entra.
    expect(base.openRegistration).toBe(false);
    expect(canSignIn(base)).toBe(false);
  });
});

describe("decideAccess, palavra-chave", () => {
  it("deixa passar, porque a validação é feita antes", () => {
    const d = decideAccess({ ...base, provider: "password" });
    expect(d).toEqual({ allow: true, reason: "palavra-chave" });
  });

  it("não é afetado pelo registo estar fechado", () => {
    expect(canSignIn({ ...base, provider: "password", openRegistration: false })).toBe(true);
  });
});

describe("decideAccess, outros fornecedores", () => {
  it("a regra é a mesma para a Microsoft", () => {
    expect(canSignIn({ ...base, provider: "microsoft-entra-id" })).toBe(false);
    expect(canSignIn({ ...base, provider: "microsoft-entra-id", hasAccount: true })).toBe(true);
  });
});
