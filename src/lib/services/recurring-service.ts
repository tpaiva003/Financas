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
    return 0; // tabela indisponível / migração por aplicar, não bloqueia a app
  }

  const today = asOf ?? new Date().toISOString().slice(0, 10);

  /**
   * Templates E ocorrências em paralelo. Isto corre à frente do dashboard, e
   * a versão em série pagava um par exists+insert por ocorrência, em fila:
   * quem voltava de um mês de férias esperava ~30 idas encadeadas a olhar
   * para um ecrã em branco. As ocorrências são datas independentes, e a
   * idempotência não vem da ordem — vem do exists + índice único, com a
   * colisão tratada como caminho normal.
   */
  const porTemplate = await Promise.all(
    templates.map(async (t) => {
      if (t.status !== "active") return 0;

      const { occurrences, nextDate, finished } = enumerateDue({
        nextDate: t.nextDate,
        frequency: t.frequency,
        asOf: today,
        endDate: t.endDate,
      });
      if (occurrences.length === 0) return 0;

      const criadas = await Promise.all(
        occurrences.map(async (date): Promise<number> => {
          try {
            if (await repo.recurringExpenseExists(t.id, t.spaceId, date)) return 0;
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
            return 1;
          } catch {
            // Colisão de unicidade (gerada entretanto), ignora.
            return 0;
          }
        }),
      );

      try {
        await repo.updateRecurring(t.id, t.spaceId, {
          nextDate,
          ...(finished ? { status: "paused" as const } : {}),
        });
      } catch {
        // não bloqueia
      }

      return criadas.reduce((soma, n) => soma + n, 0);
    }),
  );

  return porTemplate.reduce((soma, n) => soma + n, 0);
}
