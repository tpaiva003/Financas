/**
 * A fila de espera do registo, exercitada de verdade.
 *
 * O que aqui se protege: a fila é a **base legal do convite** (consentimento e
 * ordem de chegada), por isso sem consentimento não entra nada; insistir não
 * reescreve a entrada de quem já lá está; e o formulário responde o mesmo a
 * email novo e a email repetido, para não servir de oráculo de quem está na
 * fila.
 */

import { describe, expect, it, vi } from "vitest";
import type { MockRepository } from "@/lib/data/mock-repository";

vi.mock("@/lib/data", async () => {
  const { MockRepository: M } = await import("@/lib/data/mock-repository");
  const repo = new M();
  return { getRepository: () => repo };
});

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

async function fila() {
  const { getRepository } = await import("@/lib/data");
  return (getRepository() as unknown as MockRepository).listWaitlist();
}

// Sem limpeza entre testes, de propósito: o mock é um singleton de módulo e
// cada teste usa o seu email — como pessoas diferentes na mesma fila.
describe("waitlistAction", () => {
  it("guarda o email com consentimento e a origem", async () => {
    const { waitlistAction } = await import("./landing-actions");
    const r = await waitlistAction(
      {},
      form({ email: "nova@exemplo.pt", consent: "on", source: "registo-cheio" }),
    );
    expect(r.ok).toBe(true);

    const entradas = await fila();
    const eu = entradas.find((e) => e.email === "nova@exemplo.pt");
    expect(eu?.consent).toBe(true);
    expect(eu?.source).toBe("registo-cheio");
    expect(eu?.invitedAt).toBeNull();
  });

  it("sem consentimento não entra: a fila é a base legal do convite", async () => {
    const { waitlistAction } = await import("./landing-actions");
    const r = await waitlistAction({}, form({ email: "sem@exemplo.pt" }));
    expect(r.ok).toBeUndefined();
    expect(r.error).toContain("Aceita");
    expect((await fila()).some((e) => e.email === "sem@exemplo.pt")).toBe(false);
  });

  it("repetir não reescreve a entrada nem denuncia quem já está na fila", async () => {
    const { waitlistAction } = await import("./landing-actions");
    await waitlistAction({}, form({ email: "fiel@exemplo.pt", consent: "on", source: "landing" }));
    const antes = (await fila()).find((e) => e.email === "fiel@exemplo.pt")!;

    // Segunda submissão, de outro sítio: a resposta é o mesmo `ok` de sempre —
    // o formulário não pode ser usado para descobrir quem está inscrito.
    const r2 = await waitlistAction(
      {},
      form({ email: "FIEL@exemplo.pt", consent: "on", source: "registo-cheio" }),
    );
    expect(r2.ok).toBe(true);

    const depois = (await fila()).filter((e) => e.email === "fiel@exemplo.pt");
    expect(depois).toHaveLength(1);
    expect(depois[0]!.createdAt).toBe(antes.createdAt);
    expect(depois[0]!.source).toBe("landing"); // a origem original fica
  });

  it("o honeypot engole os robôs sem os avisar", async () => {
    const { waitlistAction } = await import("./landing-actions");
    const r = await waitlistAction(
      {},
      form({ email: "robo@exemplo.pt", consent: "on", company: "Robo, SA" }),
    );
    // "ok" para o robô, e nada na fila.
    expect(r.ok).toBe(true);
    expect((await fila()).some((e) => e.email === "robo@exemplo.pt")).toBe(false);
  });
});

/**
 * O tecto de contas por dia está no único ramo por onde uma conta nasce
 * sozinha. Como o Auth.js não se instancia em teste (ver
 * `auth-primeira-entrada.test.ts`), afirma-se sobre o código o que não se
 * consegue exercitar: o registo aberto pergunta ao `decideSignup` antes de
 * criar, e quem não cabe vai para a porta fechada em vez de levar um erro.
 */
describe("o tecto diário no registo aberto", () => {
  it("o caminho que cria contas sozinho pergunta primeiro se há vaga", async () => {
    const { readFileSync } = await import("node:fs");
    const auth = readFileSync("src/lib/auth.ts", "utf8");
    expect(auth).toContain("decideSignup");
    expect(auth).toContain("countAppUsersCreatedOn");
    // A ordem importa: a decisão antes do `createAppUser`, não depois.
    expect(auth.indexOf("decideSignup(criadasHoje)")).toBeLessThan(auth.indexOf("createAppUser"));
    // E a saída é a porta fechada com a fila, não um "false" mudo.
    expect(auth).toContain('"/login?cheio=1"');
  });
});
