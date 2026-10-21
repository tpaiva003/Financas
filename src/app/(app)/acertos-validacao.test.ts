/**
 * Um acerto só existe entre participantes do ambiente.
 *
 * O pagador de uma despesa já era validado contra os membros; o pagador e o
 * recetor de um acerto não eram — qualquer string entrava no saldo, e um id
 * de outro ambiente distorcia o `computeBalance` sem ninguém perceber de onde
 * vinha. O saldo tem de ser sempre explicável.
 */

import { describe, expect, it, vi } from "vitest";

const CTX = {
  user: { id: "u1", email: "a@x.pt", name: "A" },
  space: { id: "casa", name: "Casa", plan: "full" },
  spaces: [{ id: "casa", name: "Casa", plan: "full" }],
  members: [
    { id: "m1", name: "A", linkedUserId: "u1", role: "full" },
    { id: "m2", name: "B", linkedUserId: null, role: "full" },
  ],
  fullMembers: [
    { id: "m1", name: "A", linkedUserId: "u1", role: "full" },
    { id: "m2", name: "B", linkedUserId: null, role: "full" },
  ],
  viewerMemberId: "m1",
  viewerRole: "full",
  congelado: false,
};

vi.mock("@/lib/space", () => ({
  SPACE_COOKIE: "space",
  getSpaceContext: async () => CTX,
  getTargetSpace: async () => null,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }));
vi.mock("@/lib/session", () => ({ requireUser: async () => CTX.user }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("REDIRECT");
  },
}));

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

describe("createSettlementAction", () => {
  it("recusa um pagador que não é participante do ambiente", async () => {
    const { createSettlementAction } = await import("./actions");
    const r = await createSettlementAction(
      {},
      form({
        fromUserId: "id-de-outro-ambiente",
        toUserId: "m1",
        amount: "10",
        date: "2026-08-17",
      }),
    );
    expect(r.error).toBe("Participante inválido.");
  });

  it("recusa um recetor que não é participante do ambiente", async () => {
    const { createSettlementAction } = await import("./actions");
    const r = await createSettlementAction(
      {},
      form({
        fromUserId: "m1",
        toUserId: "id-inventado",
        amount: "10",
        date: "2026-08-17",
      }),
    );
    expect(r.error).toBe("Participante inválido.");
  });

  it("aceita um acerto entre participantes verdadeiros", async () => {
    const { createSettlementAction } = await import("./actions");
    // O caminho feliz termina num redirect — que aqui é o sinal de sucesso.
    await expect(
      createSettlementAction(
        {},
        form({ fromUserId: "m1", toUserId: "m2", amount: "10", date: "2026-08-17" }),
      ),
    ).rejects.toThrow("REDIRECT");
  });
});
