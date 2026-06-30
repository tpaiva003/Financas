/**
 * Deduplicação e reconciliação (REQ-IMP-4, REQ-IMP-5, REQ-DAT-1).
 *
 * Invariante: a mesma transação nunca entra duas vezes.
 */

import { stableUid } from "./normalize";
import type { Expense, NormalizedTransaction } from "./types";

export interface DedupRow {
  transaction: NormalizedTransaction;
  uid: string;
  /** Já existe uma despesa com este UID? */
  isDuplicate: boolean;
  /** Id da despesa existente que casa (se duplicado). */
  existingExpenseId?: string;
}

export interface DedupResult {
  rows: DedupRow[];
  newCount: number;
  duplicateCount: number;
}

/**
 * Classifica transações de um import contra o conjunto de UIDs já existentes.
 * Duplicados internos (o mesmo UID repetido dentro do próprio ficheiro) também
 * são marcados — só a primeira ocorrência conta como nova.
 */
export function detectDuplicates(
  incoming: NormalizedTransaction[],
  existing: Pick<Expense, "id" | "uid">[],
): DedupResult {
  const existingByUid = new Map<string, string>();
  for (const e of existing) existingByUid.set(e.uid, e.id);

  const seenInBatch = new Set<string>();
  const rows: DedupRow[] = [];
  let newCount = 0;
  let duplicateCount = 0;

  for (const tx of incoming) {
    const uid = stableUid(tx);
    const existingId = existingByUid.get(uid);
    const isDup = existingId !== undefined || seenInBatch.has(uid);

    if (isDup) {
      duplicateCount += 1;
    } else {
      newCount += 1;
      seenInBatch.add(uid);
    }

    rows.push({
      transaction: tx,
      uid,
      isDuplicate: isDup,
      existingExpenseId: existingId,
    });
  }

  return { rows, newCount, duplicateCount };
}

export interface ReconciliationSuggestion {
  transaction: NormalizedTransaction;
  uid: string;
  candidateExpenseId: string;
}

/**
 * Reconciliação manual ↔ extrato (REQ-IMP-5): se uma despesa foi metida à mão e
 * depois aparece no extrato importado, sugere casá-las em vez de duplicar.
 *
 * Critério: mesmo montante e mesma moeda, datas dentro de `dateToleranceDays`,
 * entre uma despesa de origem "manual" (ainda não casada por UID) e a transação.
 */
export function suggestReconciliation(
  incoming: NormalizedTransaction[],
  manualExpenses: Expense[],
  dateToleranceDays = 3,
): ReconciliationSuggestion[] {
  const suggestions: ReconciliationSuggestion[] = [];
  const usedExpenseIds = new Set<string>();

  for (const tx of incoming) {
    const uid = stableUid(tx);
    const txTime = Date.parse(tx.transactionDate);

    const candidate = manualExpenses.find((e) => {
      if (e.origin !== "manual" || e.deletedAt) return false;
      if (usedExpenseIds.has(e.id)) return false;
      if (e.uid === uid) return false; // já é o mesmo, trata o dedup normal
      if (e.amountCents !== tx.amountCents || e.currency !== tx.currency) return false;
      const eTime = Date.parse(e.transactionDate);
      const diffDays = Math.abs(eTime - txTime) / 86_400_000;
      return diffDays <= dateToleranceDays;
    });

    if (candidate) {
      usedExpenseIds.add(candidate.id);
      suggestions.push({ transaction: tx, uid, candidateExpenseId: candidate.id });
    }
  }

  return suggestions;
}
