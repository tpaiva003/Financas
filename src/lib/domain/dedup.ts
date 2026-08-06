/**
 * Reconciliação entre o que foi metido à mão e o que vem no extrato
 * (REQ-IMP-5, REQ-DAT-1).
 *
 * A deduplicação propriamente dita (o invariante de que a mesma transação nunca
 * entra duas vezes) vive no serviço de importação, que a faz contra a base de
 * dados perguntando só pelos UIDs do ficheiro. Aqui trata-se do caso que os
 * UIDs não apanham: a mesma despesa escrita à mão antes de chegar o extrato,
 * que não tem UID em comum nenhum e mesmo assim é a mesma compra.
 */

import { stableUid } from "./normalize";
import type { Expense, NormalizedTransaction } from "./types";

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
