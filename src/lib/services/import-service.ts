/**
 * Importação de extratos bancários (REQ-IMP).
 *
 * Fluxo: ficheiro → grelha → mapeamento de colunas → transações normalizadas →
 * dedup por UID estável + sugestão de categoria + aviso de reconciliação com
 * entradas manuais. A confirmação cria as despesas num lote reversível.
 *
 * Invariantes respeitados:
 *  - a mesma transação nunca entra duas vezes (UID estável, ver dedup.ts);
 *  - "quem pagou" é independente de "como se divide";
 *  - a classificação é só uma SUGESTÃO, sempre sobreponível na pré-visualização.
 */

import { getRepository } from "@/lib/data";
import { classify, detectDuplicates, suggestReconciliation } from "@/lib/domain";
import type { Expense, Split } from "@/lib/domain";
import { detectMapping, rowsToTransactions } from "@/lib/import/columns";
import { readUploadToGrid, MAX_IMPORT_BYTES } from "@/lib/import/read-file";
import type { ImportCommitPayload, ImportPreview, ImportPreviewRow } from "@/lib/import/types";

export class ImportError extends Error {}

/** Lê o ficheiro e devolve a pré-visualização já deduplicada e classificada. */
export async function buildImportPreview(params: {
  file: File;
  source: string;
  account?: string | null;
  spaceId: string;
  viewerMemberId: string;
}): Promise<ImportPreview> {
  const { file, source, account, spaceId, viewerMemberId } = params;

  if (!file || file.size === 0) throw new ImportError("Escolhe um ficheiro.");
  if (file.size > MAX_IMPORT_BYTES) {
    throw new ImportError("Ficheiro demasiado grande (máximo 8 MB).");
  }

  let grid;
  try {
    grid = await readUploadToGrid(file);
  } catch {
    throw new ImportError("Não consegui ler o ficheiro. Exporta em Excel (.xlsx) ou CSV.");
  }
  if (grid.length === 0) throw new ImportError("O ficheiro está vazio.");

  const mapping = detectMapping(grid);
  if (!mapping) {
    throw new ImportError(
      "Não reconheci as colunas do ficheiro. Precisa de ter data, descrição e valor.",
    );
  }

  const transactions = rowsToTransactions(grid, mapping, source, account ?? null);
  if (transactions.length === 0) {
    throw new ImportError("Não encontrei transações neste ficheiro.");
  }

  const repo = getRepository();
  const [existing, rules, expenses] = await Promise.all([
    repo.listExpenseUids(spaceId),
    repo.listClassificationRules(),
    repo.listExpenses({ spaceId, viewerId: viewerMemberId }),
  ]);

  const dedup = detectDuplicates(transactions, existing as Pick<Expense, "id" | "uid">[]);
  const reconciliations = suggestReconciliation(transactions, expenses);
  const byUid = new Map(reconciliations.map((r) => [r.uid, r.candidateExpenseId]));
  const expenseById = new Map(expenses.map((e) => [e.id, e]));

  // Proteção contra sobreposição: o que já está registado na app é "live" e não
  // pode ser duplicado por um extrato que cobre esses mesmos dias.
  const lastExpenseDate = expenses.reduce<string | null>(
    (max, e) => (!e.deletedAt && (max === null || e.transactionDate > max) ? e.transactionDate : max),
    null,
  );
  const suggestedFromDate = lastExpenseDate ? nextDay(lastExpenseDate) : null;

  const rows: ImportPreviewRow[] = dedup.rows.map((row) => {
    const hintId = row.isDuplicate ? undefined : byUid.get(row.uid);
    const hintExpense = hintId ? expenseById.get(hintId) : undefined;
    return {
      uid: row.uid,
      description: row.transaction.description,
      transactionDate: row.transaction.transactionDate,
      amountCents: row.transaction.amountCents,
      isDuplicate: row.isDuplicate,
      suggestedCategoryId: classify(row.transaction.description, rules).categoryId ?? null,
      reconcileHint: hintExpense
        ? {
            expenseId: hintExpense.id,
            description: hintExpense.description,
            date: hintExpense.transactionDate,
          }
        : null,
      inCoveredPeriod: lastExpenseDate !== null && row.transaction.transactionDate <= lastExpenseDate,
    };
  });

  const coveredCount = rows.filter((r) => r.inCoveredPeriod).length;

  const header = grid[mapping.headerRow];
  const label = (i: number) => (i >= 0 ? (header?.[i] ?? `coluna ${i + 1}`) : null);
  const amountLabel =
    mapping.amountCol >= 0
      ? `valor: ${label(mapping.amountCol)}${mapping.invertSign ? " (sinal invertido)" : ""}`
      : `débito: ${label(mapping.debitCol)} · crédito: ${label(mapping.creditCol)}`;

  return {
    source,
    fileName: file.name,
    rowCount: transactions.length,
    newCount: dedup.newCount,
    duplicateCount: dedup.duplicateCount,
    rows,
    mappingLabel: `data: ${label(mapping.dateCol)} · descrição: ${label(mapping.descriptionCol)} · ${amountLabel}`,
    lastExpenseDate,
    suggestedFromDate,
    coveredCount,
  };
}

/** Dia seguinte a uma data ISO (aaaa-mm-dd). */
function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Cria as despesas escolhidas, dentro de um lote reversível. */
export async function commitImport(params: {
  payload: ImportCommitPayload;
  spaceId: string;
  memberIds: string[];
  viewerMemberId: string;
  userId: string;
}): Promise<{ imported: number; batchId: string | null }> {
  const { payload, spaceId, memberIds, viewerMemberId, userId } = params;

  if (!memberIds.includes(payload.payerId)) throw new ImportError("Pagador inválido.");
  const rows = payload.rows.filter((r) => r.amountCents !== 0);
  if (rows.length === 0) throw new ImportError("Não escolheste nenhuma despesa para importar.");

  const split = buildImportSplit(payload, memberIds);
  const repo = getRepository();

  // O lote serve para poder anular a importação. Se a tabela ainda não existir
  // (migração por aplicar), importamos na mesma: a dedução por UID continua a
  // proteger contra duplicados; só se perde o "anular lote".
  let batchId: string | null = null;
  try {
    const batch = await repo.createImportBatch({
      spaceId,
      source: payload.source,
      fileName: payload.fileName,
      rowCount: payload.rowCount,
      importedCount: rows.length,
      duplicateCount: payload.duplicateCount,
      createdBy: userId,
    });
    batchId = batch.id;
  } catch {
    batchId = null;
  }

  let imported = 0;
  for (const row of rows) {
    const kind = row.kind === "personal" ? "personal" : "shared";
    await repo.createExpense({
      spaceId,
      description: row.description,
      amountCents: row.amountCents,
      currency: "EUR",
      transactionDate: row.transactionDate,
      categoryId: row.categoryId || null,
      payerId: payload.payerId,
      kind,
      split: kind === "personal" ? { type: "EQUAL" } : split,
      origin: "import",
      status: "confirmed",
      ownerId: kind === "personal" ? viewerMemberId : payload.payerId,
      visibleToPartner: false,
      createdBy: userId,
      // UID do extrato: garante que reimportar o ficheiro não duplica.
      uid: row.uid,
      importBatchId: batchId,
    });
    imported += 1;
  }

  return { imported, batchId };
}

function buildImportSplit(payload: ImportCommitPayload, memberIds: string[]): Split {
  if (payload.splitType === "SOLE") {
    const target = payload.soleMemberId;
    if (!target || !memberIds.includes(target)) {
      throw new ImportError("Escolhe de quem é a despesa.");
    }
    const weights: Record<string, number> = {};
    for (const id of memberIds) weights[id] = id === target ? 100 : 0;
    return { type: "PERCENT", weights };
  }

  if (payload.splitType === "PERCENT" && memberIds.length === 2) {
    const pa = payload.percentA ?? 50;
    if (pa < 0 || pa > 100) throw new ImportError("Percentagem inválida.");
    return { type: "PERCENT", weights: { [memberIds[0]!]: pa, [memberIds[1]!]: 100 - pa } };
  }

  return { type: "EQUAL" };
}
