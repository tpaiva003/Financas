/**
 * Registar um investimento cria a compra que lhe deu origem.
 *
 * **O que isto protege.** O formulário pede unidades e preço de compra, e isso
 * é a descrição de um negócio com data. Antes, gravava-se só a posição no bem:
 * o investimento nascia com um histórico vazio, sem TIR, sem TWR e sem
 * comparação com o índice, e a própria ficha dizia "ainda não há movimentos" a
 * quem tinha acabado de registar a compra. Quem quisesse as contas certas tinha
 * de escrever tudo outra vez, como movimento.
 *
 * **E apagar o único movimento leva o investimento.** Um ativo cuja posição
 * vive no movimento não fica "a zero" quando ele desaparece: fica uma linha
 * sem nada na carteira. Mas uma posição escrita à mão sobrevive sempre — é o
 * invariante das entradas manuais — e aí o ativo fica.
 *
 * Corre contra o repositório de mentira, com a sessão e a cache substituídas:
 * o que se mede é o que ficou gravado, e não o que a função devolveu.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockRepository } from "@/lib/data/mock-repository";

const ESPACO = "casa-investimentos";

vi.mock("@/lib/data", async () => {
  const { MockRepository: M } = await import("@/lib/data/mock-repository");
  const repo = new M();
  return { getRepository: () => repo };
});

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// A sessão vive fora daqui, e arrastava o Auth.js inteiro para dentro do teste.
vi.mock("@/lib/session", () => ({
  requireUser: async () => ({ id: "u1", name: "Tiago", email: "tiago@example.com" }),
  getUser: async () => ({ id: "u1", name: "Tiago", email: "tiago@example.com" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
}));

vi.mock("@/lib/space", () => ({
  getSpaceContext: async () => ({
    space: { id: ESPACO, name: "Casa", plan: "full" },
    user: { id: "u1", name: "Tiago", email: "tiago@example.com" },
    members: [],
    fullMembers: [],
    viewerRole: "full",
    viewerMemberId: "m1",
    spaces: [],
    congelado: false,
  }),
  getTargetSpace: async () => ESPACO,
  SPACE_COOKIE: "espaco",
}));

function form(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

async function repositorio() {
  const { getRepository } = await import("@/lib/data");
  return getRepository() as unknown as MockRepository;
}

describe("registar um investimento", () => {
  beforeEach(async () => {
    const repo = await repositorio();
    for (const a of await repo.listAssets(ESPACO)) await repo.deleteAsset(a.id, ESPACO);
  });

  it("cria o ativo E a compra que lhe deu origem", async () => {
    const { saveAssetAction } = await import("./actions");
    const repo = await repositorio();

    const r = await saveAssetAction(
      {},
      form({
        name: "Empresa de Ensaio",
        kind: "investimento",
        quantity: "100",
        unitCost: "12,00",
        purchasedAt: "2026-03-04",
        symbol: "ens.us",
      }),
    );
    expect(r.error).toBeUndefined();

    const [bem] = await repo.listAssets(ESPACO);
    expect(bem?.name).toBe("Empresa de Ensaio");

    const movimentos = await repo.listAssetTrades(ESPACO, bem!.id);
    expect(movimentos).toHaveLength(1);
    expect(movimentos[0]).toMatchObject({
      kind: "compra",
      date: "2026-03-04",
      quantity: 100,
      amountCents: 120_000,
    });
  });

  /**
   * Duas versões da mesma verdade divergem à primeira correção: o movimento
   * passa a mandar (ver `derivePosition`), e a posição escrita no bem ficava
   * lá em baixo a dizer outra coisa a quem fosse ler a linha em cru.
   */
  it("a posição fica no movimento e não escrita no bem", async () => {
    const { saveAssetAction } = await import("./actions");
    const repo = await repositorio();

    await saveAssetAction(
      {},
      form({ name: "Outra", kind: "investimento", quantity: "50", unitCost: "10,00" }),
    );

    const [bem] = await repo.listAssets(ESPACO);
    expect(bem?.quantity ?? null).toBeNull();
    expect(bem?.unitCostCents ?? null).toBeNull();
  });

  it("apagar o único movimento apaga o investimento", async () => {
    const { saveAssetAction, deleteAssetTradeAction } = await import("./actions");
    const repo = await repositorio();

    await saveAssetAction(
      {},
      form({ name: "Só uma compra", kind: "investimento", quantity: "10", unitCost: "20,00" }),
    );
    const [bem] = await repo.listAssets(ESPACO);
    const [mov] = await repo.listAssetTrades(ESPACO, bem!.id);

    // A ação leva a página para a lista, que já não tem este ativo.
    await expect(
      deleteAssetTradeAction(form({ id: mov!.id, assetId: bem!.id, apagarAtivo: "1" })),
    ).rejects.toThrow("REDIRECT:/patrimonio/ativos");

    expect(await repo.listAssets(ESPACO)).toHaveLength(0);
  });

  /**
   * O invariante das entradas manuais. Quem escreveu a posição à mão e depois
   * lançou movimentos por cima fica com a posição escrita quando eles saem —
   * apagar-lhe o ativo era destruir o que ele escreveu.
   */
  it("não apaga o ativo quando há posição escrita à mão a que voltar", async () => {
    const { deleteAssetTradeAction } = await import("./actions");
    const repo = await repositorio();

    const bem = await repo.createAsset({
      spaceId: ESPACO,
      name: "Escrito à mão",
      kind: "investimento",
      quantity: 80,
      unitCostCents: 1_000,
    });
    const mov = await repo.createAssetTrade({
      spaceId: ESPACO,
      assetId: bem.id,
      date: "2026-01-05",
      kind: "compra",
      quantity: 80,
      amountCents: 80_000,
    });

    await deleteAssetTradeAction(form({ id: mov.id, assetId: bem.id, apagarAtivo: "1" }));

    const bens = await repo.listAssets(ESPACO);
    expect(bens).toHaveLength(1);
    expect(bens[0]!.quantity).toBe(80);
  });

  /**
   * O formulário de edição de um investimento com movimentos deixou de pedir
   * unidades — elas vêm de lá. Se a ação continuasse a exigi-las, mudar só o
   * nome ou o preço atual passava a dar "Indica quantas unidades tens", e não
   * havia campo nenhum onde as escrever.
   */
  it("edita um investimento com movimentos sem lhe pedir unidades", async () => {
    const { saveAssetAction } = await import("./actions");
    const repo = await repositorio();

    await saveAssetAction(
      {},
      form({ name: "Antes", kind: "investimento", quantity: "10", unitCost: "20,00" }),
    );
    const [bem] = await repo.listAssets(ESPACO);

    const r = await saveAssetAction(
      {},
      form({ id: bem!.id, name: "Depois", kind: "investimento", unitPrice: "30,00" }),
    );

    expect(r.error).toBeUndefined();
    const [depois] = await repo.listAssets(ESPACO);
    expect(depois!.name).toBe("Depois");
    expect(depois!.unitPriceCents).toBe(3_000);
    // E o movimento continua a ser quem manda na posição.
    const movs = await repo.listAssetTrades(ESPACO, bem!.id);
    expect(movs).toHaveLength(1);
    expect(movs[0]!.quantity).toBe(10);
  });

  /**
   * O caso de quem se enganou antes de isto existir.
   *
   * Os investimentos são desenhados em cartões, e o cartão não tem "Remover";
   * a ficha só tinha o "Remover" de cada movimento. Um investimento criado por
   * engano e sem movimentos nenhuns — que é como fica quem se enganou a
   * registar — não se conseguia apagar em lado nenhum.
   */
  it("apaga um investimento sem movimentos, que não tinha por onde ser apagado", async () => {
    const { removerInvestimentoAction } = await import("./actions");
    const repo = await repositorio();

    const bem = await repo.createAsset({
      spaceId: ESPACO,
      name: "Criado por engano",
      kind: "investimento",
      quantity: 5,
      unitCostCents: 1_000,
    });

    await expect(removerInvestimentoAction({}, form({ id: bem.id }))).rejects.toThrow(
      "REDIRECT:/patrimonio/ativos",
    );
    expect(await repo.listAssets(ESPACO)).toHaveLength(0);
  });

  /** Com movimentos, vão todos atrás — e não ficam linhas órfãs para trás. */
  it("apagar o investimento leva os movimentos", async () => {
    const { saveAssetAction, removerInvestimentoAction } = await import("./actions");
    const repo = await repositorio();

    await saveAssetAction(
      {},
      form({ name: "Com história", kind: "investimento", quantity: "10", unitCost: "20,00" }),
    );
    const [bem] = await repo.listAssets(ESPACO);
    await repo.createAssetTrade({
      spaceId: ESPACO,
      assetId: bem!.id,
      date: "2026-02-02",
      kind: "compra",
      quantity: 5,
      amountCents: 10_000,
    });
    expect(await repo.listAssetTrades(ESPACO, bem!.id)).toHaveLength(2);

    await expect(removerInvestimentoAction({}, form({ id: bem!.id }))).rejects.toThrow("REDIRECT:");

    expect(await repo.listAssets(ESPACO)).toHaveLength(0);
    expect(await repo.listAssetTrades(ESPACO, bem!.id)).toHaveLength(0);
  });

  /** Um id de outro ambiente não apaga nada, e diz porquê. */
  it("não apaga o que não é deste ambiente", async () => {
    const { removerInvestimentoAction } = await import("./actions");
    const repo = await repositorio();

    const alheio = await repo.createAsset({
      spaceId: "outra-casa",
      name: "De outra pessoa",
      kind: "investimento",
      quantity: 1,
      unitCostCents: 100,
    });

    const r = await removerInvestimentoAction({}, form({ id: alheio.id }));

    expect(r.error).toBe("Esse investimento não é deste ambiente.");
    expect(await repo.listAssets("outra-casa")).toHaveLength(1);
  });

  /**
   * Os investimentos que ficaram para trás.
   *
   * Antes de registar um investimento passar a criar o movimento, o formulário
   * gravava só a posição no bem. Esses ficaram com o histórico vazio — sem TIR,
   * sem TWR, sem comparação com o índice — e nada na app lhes tocava.
   */
  it("cria a compra que falta a um investimento antigo, com a data que lhe deram", async () => {
    const { criarMovimentosEmFaltaAction } = await import("./actions");
    const repo = await repositorio();

    const bem = await repo.createAsset({
      spaceId: ESPACO,
      name: "Dos tempos antigos",
      kind: "investimento",
      quantity: 30,
      unitCostCents: 4_000,
      purchasedAt: "2024-05-06",
    });

    const r = await criarMovimentosEmFaltaAction({}, form({ [`data-${bem.id}`]: "2024-05-06" }));

    expect(r.error).toBeUndefined();
    const movs = await repo.listAssetTrades(ESPACO, bem.id);
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({
      kind: "compra",
      date: "2024-05-06",
      quantity: 30,
      amountCents: 120_000,
    });

    // E a posição passa para o movimento: duas versões da mesma verdade
    // divergem à primeira correção.
    const depois = (await repo.listAssets(ESPACO))[0]!;
    expect(depois.quantity ?? null).toBeNull();
    expect(depois.unitCostCents ?? null).toBeNull();
  });

  /**
   * A data diz quanto tempo o dinheiro esteve a render. Pôr a de hoje numa
   * posição de há três anos daria uma TIR absurda com ar de conta feita — e um
   * número errado com ar de resposta é pior do que não ter número nenhum.
   */
  it("não inventa data nenhuma: sem data escolhida, não cria movimento", async () => {
    const { criarMovimentosEmFaltaAction } = await import("./actions");
    const repo = await repositorio();

    const bem = await repo.createAsset({
      spaceId: ESPACO,
      name: "Sem data",
      kind: "investimento",
      quantity: 10,
      unitCostCents: 1_000,
    });

    const r = await criarMovimentosEmFaltaAction({}, form({ [`data-${bem.id}`]: "" }));

    expect(r.error).toBe("Indica a data de compra de pelo menos um.");
    expect(await repo.listAssetTrades(ESPACO, bem.id)).toHaveLength(0);
    // E a posição escrita à mão fica intacta.
    expect((await repo.listAssets(ESPACO))[0]!.quantity).toBe(10);
  });

  /** Quem já tem movimentos não entra na lista, nem recebe uma segunda compra. */
  it("não oferece compra a quem já tem movimentos", async () => {
    const { saveAssetAction } = await import("./actions");
    const { investimentosSemMovimentos } = await import("@/lib/services/movimentos-em-falta");
    const repo = await repositorio();

    await saveAssetAction(
      {},
      form({ name: "Já tem", kind: "investimento", quantity: "10", unitCost: "20,00" }),
    );
    const antigo = await repo.createAsset({
      spaceId: ESPACO,
      name: "Não tem",
      kind: "investimento",
      quantity: 5,
      unitCostCents: 1_000,
    });

    const emFalta = await investimentosSemMovimentos(ESPACO);

    expect(emFalta.map((b) => b.id)).toEqual([antigo.id]);
  });

  /** Sem o pedido explícito de quem foi avisado, o ativo fica sempre. */
  it("sem aviso não apaga o ativo", async () => {
    const { saveAssetAction, deleteAssetTradeAction } = await import("./actions");
    const repo = await repositorio();

    await saveAssetAction(
      {},
      form({ name: "Sem aviso", kind: "investimento", quantity: "10", unitCost: "20,00" }),
    );
    const [bem] = await repo.listAssets(ESPACO);
    const [mov] = await repo.listAssetTrades(ESPACO, bem!.id);

    await deleteAssetTradeAction(form({ id: mov!.id, assetId: bem!.id }));

    expect(await repo.listAssets(ESPACO)).toHaveLength(1);
  });
});
