import { describe, expect, it, vi } from "vitest";

import { getRepository } from "@/lib/data";
import { MENSAGEM_TECTO, TECTOS, tentativaCabe } from "./rate-limit";
import { waitlistAction } from "@/app/landing-actions";

/**
 * O limitador em si (semântica do mock = semântica da função SQL) e um dos
 * formulários de ponta a ponta. O login não se exercita aqui — vive dentro do
 * Auth.js — mas o `authorize` chama o mesmo `tentativaCabe` antes de qualquer
 * PBKDF2, e isso o teste do próprio auth.ts guarda por leitura do código.
 *
 * O repositório mock é um singleton e as janelas persistem entre testes — por
 * isso cada teste usa emails seus, em vez de um reset que não existe.
 */
describe("tentativaCabe", () => {
  it("deixa passar até ao tecto e recusa a partir daí", async () => {
    const { tecto } = TECTOS.login;
    for (let i = 0; i < tecto; i++) {
      expect(await tentativaCabe("login", "tecto@exemplo.pt")).toBe(true);
    }
    expect(await tentativaCabe("login", "tecto@exemplo.pt")).toBe(false);
    expect(await tentativaCabe("login", "tecto@exemplo.pt")).toBe(false);
  });

  it("cada email tem a sua janela: o tecto de um não fecha o outro", async () => {
    const { tecto } = TECTOS.login;
    for (let i = 0; i <= tecto; i++) await tentativaCabe("login", "janela-a@exemplo.pt");
    expect(await tentativaCabe("login", "janela-b@exemplo.pt")).toBe(true);
  });

  it("os escopos não se misturam: esgotar o login não fecha a recuperação", async () => {
    const { tecto } = TECTOS.login;
    for (let i = 0; i <= tecto; i++) await tentativaCabe("login", "tecto@exemplo.pt");
    expect(await tentativaCabe("recuperar", "alvo@exemplo.pt")).toBe(true);
  });

  it("a janela expira e recomeça-se do zero", async () => {
    vi.useFakeTimers();
    try {
      const { tecto, janelaMs } = TECTOS.recuperar;
      for (let i = 0; i <= tecto; i++) await tentativaCabe("recuperar", "a@b.pt");
      expect(await tentativaCabe("recuperar", "a@b.pt")).toBe(false);
      vi.advanceTimersByTime(janelaMs + 1000);
      expect(await tentativaCabe("recuperar", "a@b.pt")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("maiúsculas e espaços não abrem janelas novas", async () => {
    const { tecto } = TECTOS.waitlist;
    for (let i = 0; i < tecto; i++) await tentativaCabe("waitlist", "Alvo@Exemplo.pt");
    expect(await tentativaCabe("waitlist", "  alvo@exemplo.pt ")).toBe(false);
  });

  it("um repositório a falhar recusa em vez de deixar passar", async () => {
    const repo = getRepository();
    const spy = vi
      .spyOn(repo, "registarTentativa")
      .mockRejectedValueOnce(new Error("soluço"));
    expect(await tentativaCabe("login", "x@y.pt")).toBe(false);
    spy.mockRestore();
  });
});

describe("a fila de espera com tecto", () => {
  const pedido = (email: string) => {
    const fd = new FormData();
    fd.set("email", email);
    fd.set("consent", "on");
    return waitlistAction({}, fd);
  };

  it("a inscrição a mais leva a mensagem do tecto, não um erro genérico", async () => {
    const { tecto } = TECTOS.waitlist;
    for (let i = 0; i < tecto; i++) {
      expect((await pedido("spam@exemplo.pt")).ok).toBe(true);
    }
    const recusa = await pedido("spam@exemplo.pt");
    expect(recusa.error).toBe(MENSAGEM_TECTO);
  });
});
