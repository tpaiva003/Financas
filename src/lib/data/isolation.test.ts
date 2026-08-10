/**
 * Isolamento entre ambientes, ao nível do repositório.
 *
 * Estes testes existem por causa de uma falha real: `getExpense`, `updateExpense`,
 * `setReceiptPath`, `softDeleteExpense`, `confirmExpense` e `setExpenseApproval`
 * procuravam a despesa **só pelo id**. Quem soubesse um id de outro ambiente
 * lia-o, reescrevia-o ou apagava-o. Não havia rede por baixo: tudo corre com a
 * chave de serviço do Supabase, que ignora o RLS, por isso o `space_id` que se
 * passa aqui é a única fronteira que existe.
 *
 * Correm contra o `MockRepository` porque é o backend que os testes conseguem
 * exercitar — e por isso mesmo ele aplica a mesma regra que o Supabase. Um mock
 * mais permissivo do que a produção é um mock que deixa passar exatamente o
 * engano que estes testes tentam apanhar.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "./mock-repository";

const repo = new MockRepository();

/** O ambiente onde as despesas de exemplo vivem. */
const MEU = "casa";
/** Um ambiente qualquer que não é o meu. */
const ALHEIO = "outro-ambiente";

let despesaId: string;
let viewerId: string;

beforeEach(async () => {
  const despesas = await repo.listExpenses({ spaceId: MEU, viewerId: "" });
  const partilhada = despesas.find((e) => e.kind === "shared" && !e.deletedAt);
  if (!partilhada) throw new Error("seed sem despesa partilhada — teste inútil");
  despesaId = partilhada.id;
  viewerId = partilhada.payerId;
});

describe("uma despesa não é acessível a partir de outro ambiente", () => {
  it("lê-se com o ambiente certo", async () => {
    const e = await repo.getExpense(despesaId, MEU, viewerId);
    expect(e?.id).toBe(despesaId);
  });

  it("não se lê com o ambiente errado", async () => {
    expect(await repo.getExpense(despesaId, ALHEIO, viewerId)).toBeNull();
  });

  it("não se apaga a partir do ambiente errado", async () => {
    await repo.softDeleteExpense(despesaId, ALHEIO, viewerId);
    const e = await repo.getExpense(despesaId, MEU, viewerId);
    expect(e?.deletedAt ?? null).toBeNull();
  });

  // NOTA: o mock devolve o próprio objeto do store, não uma cópia. Guardar a
  // despesa e comparar campos depois não testa nada — a referência é a mesma e
  // "antes" muda com "depois". Por isso copia-se o valor, não o objeto.
  it("não se reescreve a partir do ambiente errado", async () => {
    const antes = await repo.getExpense(despesaId, MEU, viewerId);
    const descricaoAntes = String(antes!.description);
    const valorAntes = Number(antes!.amountCents);

    await repo.updateExpense(despesaId, ALHEIO, {
      description: "sequestrada",
      amountCents: 999_99,
      transactionDate: "2026-01-01",
      categoryId: null,
      payerId: antes!.payerId,
      kind: "shared",
      split: { type: "EQUAL" },
      ownerId: antes!.ownerId,
      visibleToPartner: false,
    });

    const depois = await repo.getExpense(despesaId, MEU, viewerId);
    expect(depois?.description).toBe(descricaoAntes);
    expect(depois?.amountCents).toBe(valorAntes);
  });

  it("não se confirma o valor a partir do ambiente errado", async () => {
    const valorAntes = Number((await repo.getExpense(despesaId, MEU, viewerId))!.amountCents);
    await repo.confirmExpense(despesaId, ALHEIO, 1);
    const depois = await repo.getExpense(despesaId, MEU, viewerId);
    expect(depois?.amountCents).toBe(valorAntes);
  });

  it("não se aprova nem rejeita a partir do ambiente errado", async () => {
    const antes = await repo.getExpense(despesaId, MEU, viewerId);
    const estadoAntes = antes!.approvalStatus ?? null;
    await repo.setExpenseApproval(despesaId, ALHEIO, "rejected");
    const depois = await repo.getExpense(despesaId, MEU, viewerId);
    expect(depois?.approvalStatus ?? null).toBe(estadoAntes);
  });

  it("não se troca o recibo a partir do ambiente errado", async () => {
    await repo.setReceiptPath(despesaId, ALHEIO, "recibos/do-atacante.png");
    const e = await repo.getExpense(despesaId, MEU, viewerId);
    expect(e?.receiptPath ?? null).not.toBe("recibos/do-atacante.png");
  });
});

/**
 * As fotografias do património contam o que uma pessoa tem, mês a mês. É dos
 * dados mais sensíveis que a app guarda, e chegam à página por uma leitura que
 * só se limita pelo `space_id` que o código passa — não há RLS a apanhar um
 * descuido aqui.
 */
describe("o histórico do património não atravessa ambientes", () => {
  it("lê-se no ambiente onde foi gravado, e só lá", async () => {
    await repo.saveNetWorthSnapshot({
      spaceId: MEU,
      onDate: "2026-08-09",
      assetsCents: 100_000_00,
      debtsCents: 40_000_00,
      netCents: 60_000_00,
      breakdown: { conta: 100_000_00 },
    });

    const meu = await repo.listNetWorthSnapshots(MEU);
    expect(meu.some((s) => s.onDate === "2026-08-09")).toBe(true);

    const alheio = await repo.listNetWorthSnapshots(ALHEIO);
    expect(alheio.some((s) => s.onDate === "2026-08-09")).toBe(false);
  });

  it("a fotografia do dia substitui a anterior em vez de acrescentar um ponto", async () => {
    await repo.saveNetWorthSnapshot({
      spaceId: MEU,
      onDate: "2026-08-10",
      assetsCents: 1_000_00,
      debtsCents: 0,
      netCents: 1_000_00,
    });
    await repo.saveNetWorthSnapshot({
      spaceId: MEU,
      onDate: "2026-08-10",
      assetsCents: 2_000_00,
      debtsCents: 0,
      netCents: 2_000_00,
    });

    const doDia = (await repo.listNetWorthSnapshots(MEU)).filter((s) => s.onDate === "2026-08-10");
    expect(doDia).toHaveLength(1);
    expect(doDia[0]?.assetsCents).toBe(2_000_00);
  });

  it("a mesma data noutro ambiente é outra fotografia", async () => {
    await repo.saveNetWorthSnapshot({
      spaceId: MEU,
      onDate: "2026-08-11",
      assetsCents: 5_000_00,
      debtsCents: 0,
      netCents: 5_000_00,
    });
    await repo.saveNetWorthSnapshot({
      spaceId: ALHEIO,
      onDate: "2026-08-11",
      assetsCents: 9_000_00,
      debtsCents: 0,
      netCents: 9_000_00,
    });

    const meu = (await repo.listNetWorthSnapshots(MEU)).find((s) => s.onDate === "2026-08-11");
    expect(meu?.assetsCents).toBe(5_000_00);
  });
});

/**
 * Corrigir um movimento é escrita, e escrita atravessa ambientes se o
 * `space_id` não filtrar. Tudo aqui corre com a chave de serviço, que ignora o
 * RLS: um id vindo de um formulário não é prova de nada.
 */
describe("um movimento de investimento não se corrige a partir de outro ambiente", () => {
  async function comMovimento() {
    const asset = await repo.createAsset({
      spaceId: MEU,
      name: "Ação de teste",
      kind: "investimento",
      quantity: null,
      unitCostCents: null,
      unitPriceCents: null,
      valueCents: null,
      purchasedAt: null,
      notes: null,
    });
    const trade = await repo.createAssetTrade({
      spaceId: MEU,
      assetId: asset.id,
      date: "2026-01-10",
      kind: "compra",
      quantity: 10,
      unitPriceCents: 100_00,
      amountCents: 1_000_00,
      notes: null,
    });
    return trade.id;
  }

  it("corrige-se com o ambiente certo", async () => {
    const id = await comMovimento();
    await repo.updateAssetTrade(id, MEU, { amountCents: 2_000_00 });

    const t = (await repo.listAssetTrades(MEU)).find((x) => x.id === id);
    expect(t?.amountCents).toBe(2_000_00);
  });

  it("não se corrige com o ambiente errado", async () => {
    const id = await comMovimento();
    await repo.updateAssetTrade(id, ALHEIO, { amountCents: 99_999_00 });

    const t = (await repo.listAssetTrades(MEU)).find((x) => x.id === id);
    expect(t?.amountCents).toBe(1_000_00);
  });
});
