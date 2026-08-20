/**
 * A passagem da retenção sobre ambientes a sério (no mock), dias a fio.
 *
 * O que aqui se protege não é a aritmética — essa está em `domain/retencao.test.ts`
 * — mas a **canalização**: que a passagem marca, congela e descongela nos sítios
 * certos, que correr duas vezes no mesmo dia não faz nada duas vezes, e que um
 * aviso que falha o envio não vira uma enxurrada de avisos diários.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockRepository } from "@/lib/data/mock-repository";

vi.mock("@/lib/data", async () => {
  const { MockRepository: M } = await import("@/lib/data/mock-repository");
  const repo = new M();
  return { getRepository: () => repo };
});

/** Os emails enviados nesta execução, para se poder contar. */
const enviados: { to: string; subject: string }[] = [];
let emailFalha = false;

vi.mock("@/lib/email/send", () => ({
  sendRetentionWarning: vi.fn(async (to: string) => {
    if (emailFalha) return { sent: false, reason: "Resend em baixo" };
    enviados.push({ to, subject: "aviso" });
    return { sent: true };
  }),
}));

const DIA = (s: string) => new Date(`${s}T06:15:00Z`);

let n = 0;

/** Um ambiente gratuito com a última atividade numa data escolhida. */
async function ambienteParado(lastActivity: string) {
  const { getRepository } = await import("@/lib/data");
  const repo = getRepository() as unknown as MockRepository;
  const space = await repo.createSpace({
    name: `Parado ${(n += 1)}`,
    createdBy: "u-teste",
    plan: "free",
    members: [{ name: "Pessoa", linkedUserId: "u-teste", email: "pessoa@exemplo.pt" }],
  });
  await repo.touchSpaceActivity(space.id, `${lastActivity}T12:00:00Z`);
  return space.id;
}

async function estadoDe(id: string) {
  const { getRepository } = await import("@/lib/data");
  const s = await getRepository().getSpace(id);
  return { frozenAt: s?.frozenAt ?? null, warnedAt: s?.retentionWarnedAt ?? null };
}

beforeEach(() => {
  enviados.length = 0;
  emailFalha = false;
});

describe("correrRetencao", () => {
  it("avisa uma vez, e não outra vez no dia seguinte", async () => {
    const id = await ambienteParado("2026-01-01");
    const { correrRetencao } = await import("./retencao-service");

    // 80 dias parado: dentro da janela de aviso (90 − 14 = 76).
    const r1 = await correrRetencao(DIA("2026-03-22"));
    expect(r1.avisados).toBeGreaterThanOrEqual(1);
    expect(enviados.some((e) => e.to === "pessoa@exemplo.pt")).toBe(true);
    expect((await estadoDe(id)).warnedAt).not.toBeNull();

    // No dia seguinte, o mesmo ambiente não é avisado outra vez.
    const antes = enviados.length;
    await correrRetencao(DIA("2026-03-23"));
    expect(enviados.length).toBe(antes);
  });

  it("congela ao fim do prazo, e correr outra vez não reescreve a data", async () => {
    const id = await ambienteParado("2026-01-01");
    const { correrRetencao } = await import("./retencao-service");

    await correrRetencao(DIA("2026-04-15"));
    const { frozenAt } = await estadoDe(id);
    expect(frozenAt).not.toBeNull();

    // A passagem do dia seguinte encontra-o congelado e deixa-o em paz. Sem o
    // estado `congelado` no domínio, isto recongelava e a data mudava.
    const r2 = await correrRetencao(DIA("2026-04-16"));
    expect((await estadoDe(id)).frozenAt).toBe(frozenAt);
    expect(r2.congelados).toBe(0);
  });

  it("descongela quando volta a haver atividade", async () => {
    const id = await ambienteParado("2026-01-01");
    const { correrRetencao } = await import("./retencao-service");
    const { getRepository } = await import("@/lib/data");

    await correrRetencao(DIA("2026-04-15"));
    expect((await estadoDe(id)).frozenAt).not.toBeNull();

    // A pessoa voltou (o layout marca a atividade ao abrir o ambiente).
    await getRepository().touchSpaceActivity(id, "2026-04-20T10:00:00Z");
    const r = await correrRetencao(DIA("2026-04-21"));
    expect(r.descongelados).toBeGreaterThanOrEqual(1);
    expect((await estadoDe(id)).frozenAt).toBeNull();
  });

  it("um email que falha não adia a marca nem repete o aviso no dia seguinte", async () => {
    await ambienteParado("2026-01-01");
    const { correrRetencao } = await import("./retencao-service");

    emailFalha = true;
    const r1 = await correrRetencao(DIA("2026-03-22"));
    expect(r1.avisosFalhados.length).toBeGreaterThanOrEqual(1);

    // Resend recuperou — mas o aviso não sai outra vez: a marca ficou posta.
    // Um Resend instável não pode dar à mesma pessoa um aviso por dia.
    emailFalha = false;
    await correrRetencao(DIA("2026-03-23"));
    expect(enviados.length).toBe(0);
  });

  it("os ambientes completos nem sequer são avaliados", async () => {
    const { getRepository } = await import("@/lib/data");
    const repo = getRepository() as unknown as MockRepository;
    const cheio = await repo.createSpace({
      name: "Pago e parado",
      createdBy: "u-full",
      plan: "full",
      members: [{ name: "Dono", linkedUserId: "u-full", email: "dono@exemplo.pt" }],
    });
    await repo.touchSpaceActivity(cheio.id, "2020-01-01T00:00:00Z");

    const { correrRetencao } = await import("./retencao-service");
    await correrRetencao(DIA("2026-08-15"));

    expect((await estadoDe(cheio.id)).frozenAt).toBeNull();
    expect(enviados.some((e) => e.to === "dono@exemplo.pt")).toBe(false);
  });
});
