/**
 * Juntar dois registos do mesmo investimento não pode perder nada.
 *
 * **O que isto protege.** Uma fusão mexe em três sítios (movimentos, anexos,
 * registo) e o terceiro apaga. Se a ordem estiver trocada, o `on delete
 * cascade` da tabela dos anexos leva com ele os documentos que alguém carregou —
 * e uma arrumação de catálogo passa a destruir ficheiros, sem nada no ecrã a
 * dizê-lo.
 *
 * Corre contra o `MockRepository`, que aplica as mesmas regras de ambiente que a
 * produção. O que ele **não** consegue apanhar é um campo que o Supabase deixe
 * cair por não estar mapeado numa coluna — isso está em `colunas.test.ts`, e é
 * uma divisão de trabalho de propósito.
 */

import { describe, expect, it } from "vitest";
import { MockRepository } from "./mock-repository";

const ESPACO = "casa";
const OUTRO = "vizinho";

/** O armazém do mock persiste entre testes; cada cenário traz ids próprios. */
let contador = 0;

async function cenario() {
  const repo = new MockRepository();
  const anexoId = `anx_${(contador += 1)}`;

  const fica = await repo.createAsset({
    spaceId: ESPACO,
    name: "TSAKOS ENERGY NAVIGATION LTD",
    kind: "investimento",
    symbol: "ten.us",
  });
  const some = await repo.createAsset({
    spaceId: ESPACO,
    name: "TSAKOS ENERGY NAVIGATI",
    kind: "investimento",
    symbol: "ten.us",
  });

  await repo.createAssetTrade({
    spaceId: ESPACO,
    assetId: fica.id,
    date: "2024-03-01",
    kind: "compra",
    quantity: 10,
    amountCents: 100_00,
  });
  await repo.createAssetTrade({
    spaceId: ESPACO,
    assetId: some.id,
    date: "2025-06-02",
    kind: "compra",
    quantity: 5,
    amountCents: 60_00,
  });
  await repo.createAssetAttachment({
    id: anexoId,
    spaceId: ESPACO,
    assetId: some.id,
    fileName: "nota.pdf",
    contentType: "application/pdf",
    sizeBytes: 1234,
    storagePath: `${ESPACO}/${some.id}/${anexoId}.pdf`,
    status: "pronto",
  });

  return { repo, fica, some, anexoId };
}

describe("juntar dois registos do mesmo investimento", () => {
  it("os movimentos dos dois ficam todos no que sobra", async () => {
    const { repo, fica, some } = await cenario();

    for (const t of await repo.listAssetTrades(ESPACO, some.id)) {
      await repo.updateAssetTrade(t.id, ESPACO, { assetId: fica.id });
    }

    const juntos = await repo.listAssetTrades(ESPACO, fica.id);
    expect(juntos).toHaveLength(2);
    // O dinheiro é o mesmo antes e depois: uma fusão não é um movimento.
    expect(juntos.reduce((s, t) => s + t.amountCents, 0)).toBe(160_00);
    expect(await repo.listAssetTrades(ESPACO, some.id)).toHaveLength(0);
  });

  /**
   * A ordem que este teste existe para fixar. `asset_attachments.asset_id` tem
   * `on delete cascade`: apagar o registo antes de passar os anexos apagava os
   * documentos de alguém.
   */
  it("os anexos passam, e não vão com o registo apagado", async () => {
    const { repo, fica, some, anexoId } = await cenario();

    const mexidos = await repo.moveAssetAttachments(some.id, fica.id, ESPACO);
    expect(mexidos).toBe(1);

    await repo.deleteAsset(some.id, ESPACO);

    const anexos = await repo.listAssetAttachments(ESPACO, fica.id);
    expect(anexos).toHaveLength(1);
    // O ficheiro não se mexe: é o caminho gravado que manda na leitura, e o id
    // do bem que lá aparece é só o sítio onde ele calhou nascer.
    expect(anexos[0]!.storagePath).toBe(`${ESPACO}/${some.id}/${anexoId}.pdf`);
  });

  it("o ambiente filtra a passagem dos anexos", async () => {
    const { repo, fica, some } = await cenario();
    // Tudo corre com a chave de serviço, que ignora o RLS: se o ambiente não
    // filtrasse aqui, quem soubesse dois ids mexia nos anexos de outra pessoa.
    expect(await repo.moveAssetAttachments(some.id, fica.id, OUTRO)).toBe(0);
    expect(await repo.listAssetAttachments(ESPACO, some.id)).toHaveLength(1);
  });

  it("o ambiente filtra a mudança de um movimento", async () => {
    const { repo, fica, some } = await cenario();
    const [t] = await repo.listAssetTrades(ESPACO, some.id);

    await repo.updateAssetTrade(t!.id, OUTRO, { assetId: fica.id });

    expect(await repo.listAssetTrades(ESPACO, some.id)).toHaveLength(1);
    expect(await repo.listAssetTrades(ESPACO, fica.id)).toHaveLength(1);
  });
});
