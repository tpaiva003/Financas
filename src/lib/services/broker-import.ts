/**
 * Importação da corretora, num sítio só.
 *
 * Antes havia dois separadores, "Movimentos" e "Posições", e a pessoa tinha de
 * saber qual dos dois ficheiros tinha na mão. Não tem de saber: **a diferença
 * lê-se no ficheiro**. Um extrato de transações tem uma coluna de datas com
 * datas a sério; uma lista de posições não tem. É isso que se usa para decidir,
 * e o que se pede é só "o ficheiro da corretora".
 *
 * E aceita vários de uma vez, porque é assim que eles vêm: um por ano, ou um
 * por conta. Cada um é lido por si, e um que falhe não estraga os outros.
 */

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
import {
  describeHoldingMapping,
  detectHoldingMapping,
  rowsToHoldings,
  type HoldingMapping,
  type HoldingRow,
} from "@/lib/import/holdings";
import { headerColumns, headerFingerprint, type Grid } from "@/lib/import/columns";
import {
  renderSample,
  sampleForModel,
  toHoldingMapping,
  toTradeMapping,
  type AiMappingAnswer,
} from "@/lib/import/ai-mapping";
import { aiMappingAvailable, readMappingWithAi } from "@/lib/services/ai-mapping-service";
import { getRepository } from "@/lib/data";
import { isForeign } from "@/lib/domain";

export type BrokerFileKind = "movimentos" | "posicoes";

export interface TradeGroup {
  name: string;
  trades: TradeRow[];
  existingAssetId: string | null;
  duplicates: number;
}

export interface BrokerFilePreview {
  fileName: string;
  /** O que se percebeu que este ficheiro é. */
  kind: BrokerFileKind | null;
  /** Porque é que não deu, quando não dá. */
  problem: string | null;
  mappingLabel: string;
  /** As primeiras linhas, para quem quiser corrigir as colunas. */
  sample: string[][];
  fingerprint: string | null;
  header: string[];
  mapping: Record<string, number> | null;
  /** Foi a leitura assistida que apontou as colunas deste ficheiro. */
  readByAi: boolean;
  /** O que a leitura assistida percebeu, para se poder conferir. */
  aiNote: string | null;
  /** Movimentos, agrupados por produto. */
  groups: TradeGroup[];
  /** Posições. */
  holdings: HoldingRow[];
  totalRows: number;
  duplicates: number;
  missingFx: number;
}

export interface BrokerPreview {
  files: BrokerFilePreview[];
  totalNewTrades: number;
  totalHoldings: number;
  totalDuplicates: number;
}

const VAZIO = {
  kind: null,
  problem: null,
  mappingLabel: "",
  sample: [] as string[][],
  fingerprint: null,
  header: [] as string[],
  mapping: null,
  readByAi: false,
  aiNote: null as string | null,
  groups: [] as TradeGroup[],
  holdings: [] as HoldingRow[],
  totalRows: 0,
  duplicates: 0,
  missingFx: 0,
};

async function readGrid(file: File): Promise<{ grid: Grid | null; problem: string | null }> {
  if (!file || file.size === 0) return { grid: null, problem: "Ficheiro vazio." };
  if (file.size > MAX_IMPORT_BYTES) {
    return { grid: null, problem: "Ficheiro demasiado grande (máximo 8 MB)." };
  }
  try {
    return { grid: await readUploadToGrid(file), problem: null };
  } catch {
    return { grid: null, problem: "Não consegui ler o ficheiro." };
  }
}

export async function buildBrokerPreview(params: {
  spaceId: string;
  files: File[];
  /** Colunas indicadas à mão. Só se aplica quando há um ficheiro só. */
  manualTrades?: TradeMapping | null;
  manualHoldings?: HoldingMapping | null;
}): Promise<BrokerPreview> {
  const repo = getRepository();
  const [assets, existingTrades] = await Promise.all([
    repo.listAssets(params.spaceId).catch(() => []),
    repo.listAssetTrades(params.spaceId).catch(() => []),
  ]);
  const assetByName = new Map(assets.map((a) => [a.name.trim().toLowerCase(), a]));
  const soLugar = params.files.length === 1;

  const files: BrokerFilePreview[] = [];
  // Os ficheiros de uma corretora vêm quase sempre em lote e todos com o mesmo
  // formato (um por ano, um por conta). Guardar a resposta pelo aspeto das
  // primeiras linhas evita pagar a mesma pergunta uma vez por ficheiro.
  const respostasIa = new Map<string, AiMappingAnswer | null>();

  for (const file of params.files) {
    const { grid, problem } = await readGrid(file);
    if (!grid) {
      files.push({ ...VAZIO, fileName: file.name, problem });
      continue;
    }

    const sample = grid.slice(0, 12).map((r) => r.map((c) => (c ?? "").toString()));

    // Formatos aprendidos ganham à deteção: foram validados por uma pessoa.
    let tradeMapping: TradeMapping | null = soLugar ? (params.manualTrades ?? null) : null;
    let holdingMapping: HoldingMapping | null = soLugar ? (params.manualHoldings ?? null) : null;

    if (!tradeMapping && !holdingMapping) {
      for (let r = 0; r < Math.min(grid.length, 25); r++) {
        const fp = headerFingerprint(grid, r);
        if (!fp) continue;
        const tpl = await repo.findImportTemplate(fp).catch(() => null);
        if (!tpl) continue;
        if (typeof tpl.mapping.dateCol === "number") {
          tradeMapping = tpl.mapping as unknown as TradeMapping;
        } else if (typeof tpl.mapping.nameCol === "number") {
          holdingMapping = tpl.mapping as unknown as HoldingMapping;
        }
        if (tradeMapping || holdingMapping) break;
      }
    }

    /**
     * Tenta um par de mapeamentos e, se der linhas, guarda a pré-visualização.
     *
     * Movimentos primeiro: um ficheiro com datas a sério é um extrato de
     * transações, e vale mais do que a fotografia das posições.
     */
    const tentar = (
      trades: TradeMapping | null,
      holdings: HoldingMapping | null,
      readByAi: boolean,
      aiNote: string | null,
    ): boolean => {
      if (trades) {
        const rows = rowsToTrades(grid, trades);
        if (rows.length > 0) {
          const groups: TradeGroup[] = groupTradesByName(rows).map((g) => {
            const existing = assetByName.get(g.name.trim().toLowerCase()) ?? null;
            const mine = existing
              ? existingTrades
                  .filter((t) => t.assetId === existing.id)
                  .map((t) => ({
                    date: t.date,
                    kind: t.kind as string,
                    quantity: t.quantity ?? 0,
                    // Compara-se pelo valor como veio no ficheiro, não pelo
                    // convertido: o gravado está em euros e o lido pode estar
                    // noutra moeda.
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

          files.push({
            ...VAZIO,
            fileName: file.name,
            kind: "movimentos",
            mappingLabel: describeTradeMapping(grid, trades),
            sample,
            fingerprint: headerFingerprint(grid, trades.headerRow),
            header: headerColumns(grid, trades.headerRow),
            mapping: { ...trades } as unknown as Record<string, number>,
            readByAi,
            aiNote,
            groups: groups.filter((g) => g.trades.length > 0 || g.duplicates > 0),
            totalRows: rows.length,
            duplicates: groups.reduce((s, g) => s + g.duplicates, 0),
            missingFx: rows.filter((t) => isForeign(t.currency) && !t.fxRate).length,
          });
          return true;
        }
      }

      // Sem datas: será uma lista de posições.
      if (holdings) {
        const rows = rowsToHoldings(grid, holdings);
        if (rows.length > 0) {
          files.push({
            ...VAZIO,
            fileName: file.name,
            kind: "posicoes",
            mappingLabel: describeHoldingMapping(grid, holdings),
            sample,
            fingerprint: headerFingerprint(grid, holdings.headerRow),
            header: headerColumns(grid, holdings.headerRow),
            mapping: { ...holdings } as unknown as Record<string, number>,
            readByAi,
            aiNote,
            holdings: rows,
            totalRows: rows.length,
          });
          return true;
        }
      }
      return false;
    };

    if (
      tentar(
        tradeMapping ?? detectTradeMapping(grid),
        holdingMapping ?? detectHoldingMapping(grid),
        false,
        null,
      )
    ) {
      continue;
    }

    /**
     * A deteção não chegou: pergunta-se a um modelo que colunas são quais.
     *
     * É aqui que entra, e só aqui. Os cabeçalhos conhecidos resolvem os formatos
     * que já vimos; isto resolve os que ninguém previu, que são a maioria dos
     * que os utilizadores trazem. O modelo aponta colunas e mais nada — a
     * leitura dos valores, a deduplicação e o câmbio continuam no código de
     * sempre.
     */
    let aiProblem: string | null = null;
    if (aiMappingAvailable()) {
      const chave = renderSample(sampleForModel(grid));
      let answer = respostasIa.get(chave) ?? null;
      if (!respostasIa.has(chave)) {
        const lida = await readMappingWithAi(grid);
        answer = lida.answer;
        aiProblem = lida.problem;
        respostasIa.set(chave, answer);
      }
      if (
        answer &&
        tentar(toTradeMapping(answer, grid), toHoldingMapping(answer, grid), true, answer.notas)
      ) {
        continue;
      }
    }

    files.push({
      ...VAZIO,
      fileName: file.name,
      sample,
      problem:
        aiProblem ??
        "Não reconheci as colunas. Carrega só este ficheiro para poderes apontá-las à mão.",
    });
  }

  return {
    files,
    totalNewTrades: files.reduce(
      (s, f) => s + f.groups.reduce((n, g) => n + g.trades.length, 0),
      0,
    ),
    totalHoldings: files.reduce((s, f) => s + f.holdings.length, 0),
    totalDuplicates: files.reduce((s, f) => s + f.duplicates, 0),
  };
}
