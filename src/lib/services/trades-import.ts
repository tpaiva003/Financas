/**
 * Gravar os movimentos de corretora que a pré-visualização aprovou.
 *
 * A leitura do ficheiro, a deteção das colunas e o agrupamento vivem no
 * `broker-import.ts`, que é o caminho por onde a app passa. Este ficheiro tinha
 * uma segunda cópia de tudo isso — um `buildTradesPreview` que já ninguém
 * chamava desde que os dois separadores ("Movimentos" e "Posições") deram lugar
 * a um só. Ficaram ~250 linhas de lógica de dedup e de templates paralela à que
 * está em produção, prontas a divergir dela e a atrair correções que nunca
 * chegariam a correr. Foi removida, e com ela o `holdings-import.ts` inteiro.
 *
 * Os ativos nascem dos movimentos: um produto que ainda não existe no património
 * é criado, um que já existe recebe os movimentos novos. Assim importar duas
 * vezes o mesmo produto não cria dois ativos com o mesmo nome.
 */

import { getRepository } from "@/lib/data";
import type { TradeRow } from "@/lib/import/trades";
import { isForeign, toEurCents } from "@/lib/domain";

export interface CommitTradesInput {
  spaceId: string;
  userId: string;
  groups: { name: string; existingAssetId: string | null; trades: TradeRow[] }[];
}

export async function commitTradesImport(input: CommitTradesInput): Promise<{
  assetsCreated: number;
  tradesImported: number;
  skippedNoFx: number;
}> {
  const repo = getRepository();
  let assetsCreated = 0;
  let tradesImported = 0;
  let skippedNoFx = 0;

  for (const g of input.groups) {
    if (g.trades.length === 0) continue;

    let assetId = g.existingAssetId;
    if (!assetId) {
      const created = await repo.createAsset({
        spaceId: input.spaceId,
        name: g.name.slice(0, 120),
        kind: "investimento",
        // A posição sai dos movimentos, não é escrita aqui.
        quantity: null,
        unitCostCents: null,
        unitPriceCents: null,
        valueCents: null,
        purchasedAt: null,
        notes: null,
        // A praça vem do ficheiro. É o que evita adivinhá-la pelo nome do
        // produto depois — e adivinhar mal é acertar no ticker de outra
        // empresa, que devolve um preço plausível todos os dias.
        exchange: g.trades.find((t) => t.exchange)?.exchange ?? null,
        createdBy: input.userId,
      });
      assetId = created.id;
      assetsCreated += 1;
    }

    for (const t of g.trades) {
      const raw = t.amountCents ?? Math.round(t.quantity * (t.unitPriceCents ?? 0));
      if (raw <= 0) continue;

      let amountCents = raw;
      if (isForeign(t.currency)) {
        // Sem câmbio não se converte: gravar dólares como se fossem euros
        // estragava a posição e o valor, e toda a gente acreditava neles.
        if (!t.fxRate) {
          skippedNoFx += 1;
          continue;
        }
        const eur = toEurCents(raw, t.fxRate);
        if (eur === null || eur <= 0) {
          skippedNoFx += 1;
          continue;
        }
        amountCents = eur;
      }

      await repo.createAssetTrade({
        spaceId: input.spaceId,
        assetId,
        date: t.date,
        kind: t.kind,
        quantity: t.kind === "compra" || t.kind === "venda" ? t.quantity : null,
        unitPriceCents:
          t.quantity > 0 && (t.kind === "compra" || t.kind === "venda")
            ? Math.round(amountCents / t.quantity)
            : null,
        amountCents,
        currency: isForeign(t.currency) ? t.currency : null,
        originalAmountCents: isForeign(t.currency) ? raw : null,
        fxRate: isForeign(t.currency) ? t.fxRate : null,
        notes: null,
        createdBy: input.userId,
      });
      tradesImported += 1;
    }
  }

  return { assetsCreated, tradesImported, skippedNoFx };
}
