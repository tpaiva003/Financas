import { describe, expect, it } from "vitest";
import {
  SIGNUPS_PER_DAY,
  decideSignup,
  FREE_LIMITS,
  checkLimit,
  limitsFor,
  planForNewSpace,
} from "@/lib/domain/limits";

describe("limitsFor", () => {
  it("um ambiente pago não tem tectos", () => {
    expect(limitsFor("full")).toBeNull();
  });

  it("um ambiente gratuito tem os tectos publicados", () => {
    expect(limitsFor("free")).toEqual(FREE_LIMITS);
  });
});

describe("checkLimit", () => {
  it("deixa criar enquanto houver espaço", () => {
    const c = checkLimit("expenses", 10, "free");
    expect(c.allowed).toBe(true);
    expect(c.remaining).toBe(90);
    expect(c.limit).toBe(100);
  });

  it("não deixa criar quando o tecto está cheio", () => {
    const c = checkLimit("expenses", 100, "free");
    expect(c.allowed).toBe(false);
    expect(c.remaining).toBe(0);
    expect(c.message).toContain("100");
  });

  it("um ambiente pago nunca é travado", () => {
    const c = checkLimit("expenses", 50_000, "full");
    expect(c.allowed).toBe(true);
    expect(c.remaining).toBeNull();
    expect(c.message).toBeNull();
  });

  it("quem já passou o tecto não perde nada, só não acrescenta", () => {
    // Acontece se o plano mudar, ou se estes números descerem. Um limite impede
    // de criar mais; não faz desaparecer dados financeiros de alguém.
    const c = checkLimit("expenses", 150, "free");
    expect(c.allowed).toBe(false);
    // Nunca negativo: "faltam -50" não quer dizer nada a ninguém.
    expect(c.remaining).toBe(0);
  });

  it("avisa antes de acabar, não só no fim", () => {
    // Uma pessoa que bate no tecto sem aviso sente-se enganada.
    const longe = checkLimit("expenses", 50, "free");
    expect(longe.nearLimit).toBe(false);
    expect(longe.message).toBeNull();

    const perto = checkLimit("expenses", 85, "free");
    expect(perto.allowed).toBe(true);
    expect(perto.nearLimit).toBe(true);
    expect(perto.message).toContain("15");
  });

  it("num tecto pequeno a margem não desaparece", () => {
    // 20% de 10 é 2, mas avisar só nos últimos 2 de 10 é tarde. O mínimo de 3
    // garante aviso mesmo nos limites pequenos.
    const c = checkLimit("assets", 7, "free");
    expect(c.nearLimit).toBe(true);
    expect(c.remaining).toBe(3);
  });

  it("concorda em singular quando falta um só", () => {
    const c = checkLimit("assets", 9, "free");
    expect(c.message).toBe("Falta 1 bem até ao limite do ambiente gratuito.");
  });

  it("concorda em plural quando faltam vários", () => {
    const c = checkLimit("assets", 8, "free");
    expect(c.message).toBe("Faltam 2 bens até ao limite do ambiente gratuito.");
  });

  it("as pessoas têm uma mensagem própria, porque duas é o produto", () => {
    // Dizer "chegaste às 2 pessoas" soa a castigo. A app é para duas pessoas.
    const c = checkLimit("members", 2, "free");
    expect(c.allowed).toBe(false);
    expect(c.message).toContain("mantém-se");
  });

  it("um ambiente vazio começa com o tecto todo disponível", () => {
    expect(checkLimit("expenses", 0, "free").remaining).toBe(FREE_LIMITS.expenses);
  });
});

describe("planForNewSpace", () => {
  it("os donos da casa não levam tectos", () => {
    expect(planForNewSpace(true)).toBe("full");
  });

  it("quem se registou sozinho começa no gratuito", () => {
    expect(planForNewSpace(false)).toBe("free");
  });
});

describe("decideSignup", () => {
  it("deixa entrar enquanto houver vaga", () => {
    expect(decideSignup(0).allowed).toBe(true);
    expect(decideSignup(0).message).toBeNull();
  });

  it("fecha a porta quando as vagas do dia acabaram", () => {
    expect(decideSignup(SIGNUPS_PER_DAY).allowed).toBe(false);
  });

  it("quem fica de fora recebe um convite, não um erro", () => {
    // Uma porta fechada por desenho não é uma avaria, e não se anuncia como tal.
    const d = decideSignup(SIGNUPS_PER_DAY);
    expect(d.message).toContain("email");
    expect(d.message).not.toMatch(/erro|falhou|inválido/i);
  });

  it("continua fechada mesmo que a contagem passe do tecto", () => {
    expect(decideSignup(SIGNUPS_PER_DAY + 50).allowed).toBe(false);
  });
});
