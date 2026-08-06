/**
 * Importação de movimentos de corretora.
 *
 * A mesma máquina dos extratos bancários e das posições: ficheiro para grelha,
 * deteção do cabeçalho, mapeamento de colunas, biblioteca de formatos
 * aprendidos. O que muda é o que se procura e o que se cria: aqui cada linha é
 * uma operação com data, e o resultado são movimentos, não posições.
 *
 * Os ativos nascem dos movimentos: um produto que ainda não existe no património
 * é criado, um que já existe recebe os movimentos novos. Assim importar duas
 * vezes o mesmo produto não cria dois ativos com o mesmo nome.
 */

import { getRepository } from "@/lib/data";
import { readUploadToGrid, MAX_IMPORT_BYTES } from "@/lib/import/read-file";
import {
  describeTradeMapping,
  detectTradeMapping,
  groupTradesByName,
  newTradesOnly,
  rowsToTrades,
  type TradeMapping,
  type TradeRow,
} from "@/lib/import/trades";
import { headerColumns, headerFingerprint } from "@/lib/import/columns";
import { isForeign, toEurCents } from "@/lib/domain";

export class TradesImportError extends Error {
  sample?: { fileName: string; rows: string[][] } | null;
  constructor(message: string, sample?: { fileName: string; rows: string[][] } | null) {
    super(message);
    this.sample = sample ?? null;
  }
}

export interface TradeGroupPreview {
  name: string;
  trades: TradeRow[];
  /** Já existe um ativo com este nome no ambiente. */
  existingAssetId: string | null;
  /** Quantos destes movimentos já lá estão. */
  duplicates: number;
}

export interface TradesPreview {
  fileName: string;
  groups: TradeGroupPreview[];
  totalRows: number;
  totalNew: number;
  totalDuplicates: number;
  mappingLabel: string;
  knownTemplate: string | null;
  fingerprint: string | null;
  header: string[];
  mapping: Record<string, number> | null;
  manualMapping: boolean;
  sample: string[][];
  /** Movimentos em moeda estrangeira sem câmbio no ficheiro. */
  missingFx: number;
}

export async function buildTradesPreview(params: {
  spaceId: string;
  file: File;
  manualMapping?: TradeMapping | null;
}): Promise<TradesPreview> {
  const { file, manualMapping } = params;
  if (!file || file.size === 0) throw new TradesImportError("Escolhe um ficheiro.");
  if (file.size > MAX_IMPORT_BYTES) {
    throw new TradesImportError("Ficheiro demasiado grande (máximo 8 MB).");
  }

  let grid;
  try {
    grid = await readUploadToGrid(file);
  } catch {
    throw new TradesImportError("Não consegui ler o ficheiro.");
  }

  const sample = {
    fileName: file.name,
    rows: grid.slice(0, 12).map((r) => r.map((c) => (c ?? "").toString())),
  };

  let mapping: TradeMapping | null = manualMapping ? { ...manualMapping } : null;
  let knownTemplate: string | null = null;

  if (!mapping) {
    for (let r = 0; r < Math.min(grid.length, 25); r++) {
      const fp = headerFingerprint(grid, r);
      if (!fp) continue;
      const tpl = await getRepository().findImportTemplate(fp).catch(() => null);
      if (tpl && typeof tpl.mapping.dateCol === "number" && typeof tpl.mapping.nameCol === "number") {
        mapping = tpl.mapping as unknown as TradeMapping;
        knownTemplate = tpl.label;
        break;
      }
    }
    mapping = mapping ?? detectTradeMapping(grid);
  }

  if (!mapping) {
    throw new TradesImportError(
      "Não reconheci as colunas. Indica onde estão a data, o ativo e a quantidade.",
      sample,
    );
  }

  const rows = rowsToTrades(grid, mapping);
  if (rows.length === 0) {
    throw new TradesImportError(
      "Com essas colunas não li nenhum movimento. Confere a linha do cabeçalho.",
      sample,
    );
  }

  // Contra o que já existe: o mesmo ficheiro importado outra vez não repete.
  const repo = getRepository();
  const [assets, existingTrades] = await Promise.all([
    repo.listAssets(params.spaceId).catch(() => []),
    repo.listAssetTrades(params.spaceId).catch(() => []),
  ]);
  const assetByName = new Map(assets.map((a) => [a.name.trim().toLowerCase(), a]));

  const groups: TradeGroupPreview[] = groupTradesByName(rows).map((g) => {
    const existing = assetByName.get(g.name.trim().toLowerCase()) ?? null;
    const mine = existing
      ? existingTrades
          .filter((t) => t.assetId === existing.id)
          .map((t) => ({
            date: t.date,
            kind: t.kind as string,
            quantity: t.quantity ?? 0,
            // Compara-se pelo valor COMO VEIO NO FICHEIRO, não pelo convertido.
            // O que está gravado está em euros; o que vem a ler está em dólares
            // se a compra foi em dólares. Comparar os dois números diretamente
            // dava sempre diferente, e reimportar o mesmo ficheiro duplicava
            // todas as compras em moeda estrangeira.
            amountCents: t.originalAmountCents ?? t.amountCents,
          }))
      : [];
    const { fresh, duplicates } = newTradesOnly(g.trades, mine);
    return {
      name: g.name,
      trades: fresh,
      existingAssetId: existing?.id ?? null,
      duplicates,
    };
  });

  return {
    fileName: file.name,
    groups: groups.filter((g) => g.trades.length > 0 || g.duplicates > 0),
    totalRows: rows.length,
    totalNew: groups.reduce((s, g) => s + g.trades.length, 0),
    totalDuplicates: groups.reduce((s, g) => s + g.duplicates, 0),
    mappingLabel: describeTradeMapping(grid, mapping),
    knownTemplate,
    fingerprint: headerFingerprint(grid, mapping.headerRow),
    header: headerColumns(grid, mapping.headerRow),
    mapping: { ...mapping } as unknown as Record<string, number>,
    manualMapping: Boolean(manualMapping) && !knownTemplate,
    sample: sample.rows,
    missingFx: rows.filter((t) => isForeign(t.currency) && !t.fxRate).length,
  };
}

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
        // estragava a posição e o valor toda a gente acreditava neles.
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
