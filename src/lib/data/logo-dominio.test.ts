/**
 * O domínio do logo só sai para membros plenos do ambiente do bem.
 *
 * A rota dos logos deixou de passar pelo contexto (que já fazia esta
 * verificação por arrasto) e passou a uma consulta leve — por isso a
 * verificação de pertença desceu para o repositório, e este teste garante que
 * ela lá está: um id não é prova de nada, e quem não pertence não recebe nem
 * a confirmação de que o bem existe.
 */

import { describe, expect, it } from "vitest";
import { MockRepository } from "./mock-repository";

const repo = new MockRepository();

async function cenario() {
  const espaco = await repo.createSpace({
    name: "Casa dos logos",
    createdBy: "u-dono-logos",
    members: [{ name: "Dono", linkedUserId: "u-dono-logos", email: "dono@exemplo.pt" }],
  });
  const bem = await repo.createAsset({
    spaceId: espaco.id,
    name: "Com marca",
    kind: "investimento",
    symbol: "aapl.us",
    quantity: 1,
    unitPriceCents: 100_00,
    logoDomain: "apple.com",
  });
  return { espaco, bem };
}

describe("getAssetLogoDomain", () => {
  it("devolve o domínio a um membro pleno, e nada a quem não pertence", async () => {
    const { espaco, bem } = await cenario();

    expect(await repo.getAssetLogoDomain(bem.id, "u-dono-logos")).toBe("apple.com");
    // Quem não é membro não recebe nada — nem a confirmação de que existe.
    expect(await repo.getAssetLogoDomain(bem.id, "u-intruso")).toBeNull();

    // Um submitter do próprio ambiente também não: não vê o património.
    const membro = await repo.addMember({
      spaceId: espaco.id,
      name: "Submissor",
      email: "sub@exemplo.pt",
      participatesFrom: null,
    });
    await repo.updateMember(membro.id, espaco.id, {
      role: "submitter",
      linkedUserId: "u-submissor-logos",
    });
    expect(await repo.getAssetLogoDomain(bem.id, "u-submissor-logos")).toBeNull();
  });
});
