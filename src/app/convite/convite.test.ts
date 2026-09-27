/**
 * O acesso de submissão é um convite, não uma conta feita por outra pessoa.
 *
 * O que se guarda aqui: (1) a conta só nasce quando quem recebe o email aceita
 * — e o teste de leitura de código garante que os caminhos de convidar não
 * voltam a criar contas diretamente, que era o que acontecia; (2) a ligação é
 * de uso único, expira e morre quando o convite se cancela; (3) um engano a
 * escrever a palavra-chave não queima a ligação.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { hashToken } from "@/lib/tokens";
import { MockRepository } from "@/lib/data/mock-repository";

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

const repo = new MockRepository();

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

/** Um ambiente com um participante convidável, e o convite já criado. */
async function prepararConvite(email: string, expiresAt?: string) {
  const space = await repo.createSpace({
    name: "Casa de teste",
    createdBy: "u-anfitriao",
    members: [{ name: "Anfitrião", linkedUserId: "u-anfitriao", email: "anf@exemplo.pt" }],
  });
  const member = await repo.addMember({
    spaceId: space.id,
    name: "Convidado",
    email,
    participatesFrom: null,
  });
  const token = `tok_${randomUUID()}`;
  await repo.createMemberInvite({
    spaceId: space.id,
    memberId: member.id,
    email,
    tokenHash: hashToken(token),
    invitedBy: "u-anfitriao",
    expiresAt: expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
  });
  return { space, member, token };
}

describe("aceitar um convite de submissão", () => {
  it("cria a conta, liga o participante, e a ligação morre no aceite", async () => {
    const { acceptMemberInviteAction } = await import("./actions");
    const { space, member, token } = await prepararConvite("convidado@exemplo.pt");

    // O sucesso termina no redirect para o login.
    await expect(
      acceptMemberInviteAction({}, form({ token, password: "segura123", confirm: "segura123" })),
    ).rejects.toThrow("REDIRECT");

    const conta = await repo.getAppUserByEmail("convidado@exemplo.pt");
    expect(conta).not.toBeNull();
    // A palavra-chave é a escolhida no aceite, não uma porta aberta.
    expect(await repo.getUserPasswordHash(conta!.id)).toBeTruthy();

    const ligado = (await repo.listMembers(space.id)).find((m) => m.id === member.id);
    expect(ligado?.linkedUserId).toBe(conta!.id);
    expect(ligado?.role).toBe("submitter");

    // Uso único: a mesma ligação já não serve para nada.
    const repetido = await acceptMemberInviteAction(
      {},
      form({ token, password: "segura123", confirm: "segura123" }),
    );
    expect(repetido.error).toMatch(/já foi usado/);
  });

  it("um engano na confirmação não queima a ligação de uso único", async () => {
    const { acceptMemberInviteAction } = await import("./actions");
    const { token } = await prepararConvite("distraido@exemplo.pt");

    const engano = await acceptMemberInviteAction(
      {},
      form({ token, password: "segura123", confirm: "outra-coisa" }),
    );
    expect(engano.error).toMatch(/não coincidem/);

    await expect(
      acceptMemberInviteAction({}, form({ token, password: "segura123", confirm: "segura123" })),
    ).rejects.toThrow("REDIRECT");
  });

  it("um convite expirado recusa, sem criar conta nenhuma", async () => {
    const { acceptMemberInviteAction } = await import("./actions");
    const { token } = await prepararConvite(
      "atrasado@exemplo.pt",
      new Date(Date.now() - 1000).toISOString(),
    );

    const r = await acceptMemberInviteAction(
      {},
      form({ token, password: "segura123", confirm: "segura123" }),
    );
    expect(r.error).toMatch(/expirou/);
    expect(await repo.getAppUserByEmail("atrasado@exemplo.pt")).toBeNull();
  });

  it("cancelar o convite mata a ligação enviada", async () => {
    const { acceptMemberInviteAction } = await import("./actions");
    const { space, member, token } = await prepararConvite("cancelado@exemplo.pt");
    await repo.deleteMemberInvites(member.id, space.id);

    const r = await acceptMemberInviteAction(
      {},
      form({ token, password: "segura123", confirm: "segura123" }),
    );
    expect(r.error).toBeTruthy();
    expect(await repo.getAppUserByEmail("cancelado@exemplo.pt")).toBeNull();
  });

  it("convidar outra vez substitui: a ligação antiga deixa de servir", async () => {
    const { space, member, token } = await prepararConvite("repetido@exemplo.pt");
    const novoToken = `tok_${randomUUID()}`;
    await repo.createMemberInvite({
      spaceId: space.id,
      memberId: member.id,
      email: "repetido@exemplo.pt",
      tokenHash: hashToken(novoToken),
      invitedBy: "u-anfitriao",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(await repo.peekMemberInvite(hashToken(token))).toBeNull();
    expect(await repo.peekMemberInvite(hashToken(novoToken))).not.toBeNull();
  });
});

describe("quem convida já não cria contas (leitura do código)", () => {
  // O teste diferencial deste commit: contra o código antigo — em que dar
  // acesso criava logo a conta pela mão de quem convidava — isto falha.
  const fonte = readFileSync(
    join(process.cwd(), "src", "app", "(app)", "actions.ts"),
    "utf8",
  );

  function corpoDe(nome: string): string {
    const inicio = fonte.indexOf(`export async function ${nome}`);
    expect(inicio, `função ${nome} não encontrada`).toBeGreaterThan(-1);
    const resto = fonte.slice(inicio + 1);
    const fim = resto.search(/export async function /);
    return resto.slice(0, fim === -1 ? undefined : fim);
  }

  it("grantSubmitterAction convida, não cria a conta", () => {
    const corpo = corpoDe("grantSubmitterAction");
    expect(corpo).not.toContain("createAppUser");
    expect(corpo).toContain("criarConviteDeSubmissao");
  });

  it("addMemberAction convida, não cria a conta", () => {
    const corpo = corpoDe("addMemberAction");
    expect(corpo).not.toContain("createAppUser");
    expect(corpo).toContain("criarConviteDeSubmissao");
  });
});
