/**
 * Geração de despesas a partir de templates recorrentes (REQ-REC-3).
 *
 * Como não há cron neste ambiente, a materialização é preguiçosa: corre quando
 * o utilizador abre páginas relevantes. É idempotente (verifica ocorrências já
 * geradas + índice único na BD) e tolerante a falhas (nunca bloqueia a app).
 *
 * Valor fixo  -> despesa "confirmed" (entra logo no saldo).
 * Valor variável -> despesa "pending" (só entra no saldo após confirmação).
 */

import { getRepository } from "@/lib/data";
import { enumerateDue } from "@/lib/domain";

export async function generateDueRecurring(spaceId: string, asOf?: string): Promise<number> {
  const repo = getRepository();

  let templates;
  try {
    templates = await repo.listRecurring(spaceId);
  } catch {
    return 0; // tabela indisponível / migração por aplicar — não bloqueia a app
  }

  const today = asOf ?? new Date().toISOString().slice(0, 10);
  let generated = 0;

  for (const t of templates) {
    if (t.status !== "active") continue;

    const { occurrences, nextDate, finished } = enumerateDue({
      nextDate: t.nextDate,
      frequency: t.frequency,
      asOf: today,
      endDate: t.endDate,
    });
    if (occurrences.length === 0) continue;

    for (const date of occurrences) {
      try {
        if (await repo.recurringExpenseExists(t.id, date)) continue;
        await repo.createExpense({
          spaceId: t.spaceId,
          description: t.description,
          amountCents: t.amountCents ?? 0,
          currency: "EUR",
          transactionDate: date,
          categoryId: t.categoryId ?? null,
          payerId: t.payerId,
          kind: t.kind,
          split: t.split,
          origin: "recurring",
          status: t.valueType === "variable" ? "pending" : "confirmed",
          ownerId: t.payerId,
          visibleToPartner: false,
          createdBy: t.createdBy ?? t.payerId,
          recurringId: t.id,
        });
        generated += 1;
      } catch {
        // Colisão de unicidade (gerada entretanto) — ignora.
      }
    }

    try {
      await repo.updateRecurring(t.id, t.spaceId, {
        nextDate,
        ...(finished ? { status: "paused" as const } : {}),
      });
    } catch {
      // não bloqueia
    }
  }

  return generated;
}
