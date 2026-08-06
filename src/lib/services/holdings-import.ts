/**
 * Importação de posições de corretora.
 *
 * Reaproveita a máquina dos extratos bancários: ficheiro para grelha,
 * deteção do cabeçalho, mapeamento de colunas, e a mesma biblioteca de formatos
 * aprendidos. Só muda o que se procura: aqui são posições, não movimentos.
 */

import { getRepository } from "@/lib/data";
import { readUploadToGrid, MAX_IMPORT_BYTES } from "@/lib/import/read-file";
import {
  describeHoldingMapping,
  detectHoldingMapping,
  rowsToHoldings,
  type HoldingMapping,
  type HoldingRow,
} from "@/lib/import/holdings";
import { headerColumns, headerFingerprint } from "@/lib/import/columns";

export class HoldingsImportError extends Error {
  sample?: { fileName: string; rows: string[][] } | null;
  constructor(message: string, sample?: { fileName: string; rows: string[][] } | null) {
    super(message);
    this.sample = sample ?? null;
  }
}

export interface HoldingsPreview {
  fileName: string;
  rows: HoldingRow[];
  mappingLabel: string;
  /** Formato guardado que reconheceu o ficheiro, se houver. */
  knownTemplate: string | null;
  /** Impressão digital, para guardar o formato depois de confirmado. */
  fingerprint: string | null;
  header: string[];
  mapping: Record<string, number> | null;
  manualMapping: boolean;
}

export async function buildHoldingsPreview(params: {
  file: File;
  manualMapping?: HoldingMapping | null;
}): Promise<HoldingsPreview> {
  const { file, manualMapping } = params;
  if (!file || file.size === 0) throw new HoldingsImportError("Escolhe um ficheiro.");
  if (file.size > MAX_IMPORT_BYTES) {
    throw new HoldingsImportError("Ficheiro demasiado grande (máximo 8 MB).");
  }

  let grid;
  try {
    grid = await readUploadToGrid(file);
  } catch {
    throw new HoldingsImportError("Não consegui ler o ficheiro.");
  }

  const sample = {
    fileName: file.name,
    rows: grid.slice(0, 12).map((r) => r.map((c) => (c ?? "").toString())),
  };

  let mapping: HoldingMapping | null = manualMapping ? { ...manualMapping } : null;
  let knownTemplate: string | null = null;

  // Formato já ensinado por alguém ganha à deteção: foi validado por uma pessoa.
  if (!mapping) {
    for (let r = 0; r < Math.min(grid.length, 25); r++) {
      const fp = headerFingerprint(grid, r);
      if (!fp) continue;
      const tpl = await getRepository().findImportTemplate(fp).catch(() => null);
      if (tpl && typeof tpl.mapping.nameCol === "number") {
        mapping = tpl.mapping as unknown as HoldingMapping;
        knownTemplate = tpl.label;
        break;
      }
    }
    mapping = mapping ?? detectHoldingMapping(grid);
  }

  if (!mapping) {
    throw new HoldingsImportError(
      "Não reconheci as colunas. Indica onde estão o ativo e a quantidade.",
      sample,
    );
  }

  const rows = rowsToHoldings(grid, mapping);
  if (rows.length === 0) {
    throw new HoldingsImportError(
      "Com essas colunas não li nenhuma posição. Confere a linha do cabeçalho.",
      sample,
    );
  }

  return {
    fileName: file.name,
    rows,
    mappingLabel: describeHoldingMapping(grid, mapping),
    knownTemplate,
    fingerprint: headerFingerprint(grid, mapping.headerRow),
    header: headerColumns(grid, mapping.headerRow),
    mapping: { ...mapping } as unknown as Record<string, number>,
    manualMapping: Boolean(manualMapping) && !knownTemplate,
  };
}
