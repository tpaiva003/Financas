/**
 * Lembretes de importação: junta o que está configurado (periodicidade por
 * banco) com o histórico de lotes (quando foi a última importação e até que
 * data), e devolve o estado pronto a mostrar.
 *
 * A lógica de datas é pura e testada em `domain/import-reminders.ts`; aqui só
 * se vai buscar os dados.
 */

import { getRepository } from "@/lib/data";
import { reminderStatus, sortByUrgency, type ReminderStatus } from "@/lib/domain";
import { IMPORT_SOURCES } from "@/lib/import/types";

export interface SpaceReminders {
  spaceId: string;
  spaceName: string;
  reminders: ReminderStatus[];
  /** Bancos já importados neste ambiente que ainda não têm periodicidade. */
  unconfigured: { source: string; label: string; lastImportAt: string }[];
}

export function sourceLabel(id: string): string {
  return IMPORT_SOURCES.find((s) => s.id === id)?.label ?? id;
}

/** Estado dos lembretes de um ambiente. Nunca rebenta se as tabelas faltarem. */
export async function getSpaceReminders(
  spaceId: string,
  spaceName: string,
  today = new Date().toISOString().slice(0, 10),
): Promise<SpaceReminders> {
  const repo = getRepository();
  const [configured, batches] = await Promise.all([
    repo.listImportReminders(spaceId).catch(() => []),
    repo.listImportBatches(spaceId).catch(() => []),
  ]);

  // Último lote de cada banco (os lotes vêm do mais recente para o mais antigo,
  // mas não confiamos nisso: escolhemos pelo máximo).
  const latest = new Map<string, { createdAt: string; lastTransactionDate: string | null }>();
  for (const b of batches) {
    const prev = latest.get(b.source);
    if (!prev || b.createdAt > prev.createdAt) {
      latest.set(b.source, {
        createdAt: b.createdAt,
        lastTransactionDate: b.lastTransactionDate ?? null,
      });
    }
  }

  const reminders = sortByUrgency(
    configured
      .filter((r) => r.active)
      .map((r) => {
        const last = latest.get(r.source);
        return reminderStatus(
          {
            source: r.source,
            label: r.label || sourceLabel(r.source),
            frequency: r.frequency,
            lastImportAt: last?.createdAt ?? null,
            lastTransactionDate: last?.lastTransactionDate ?? null,
          },
          today,
        );
      }),
  );

  const known = new Set(configured.map((r) => r.source));
  const unconfigured = [...latest.entries()]
    .filter(([source]) => !known.has(source))
    .map(([source, v]) => ({ source, label: sourceLabel(source), lastImportAt: v.createdAt }))
    .sort((a, b) => (a.lastImportAt < b.lastImportAt ? 1 : -1));

  return { spaceId, spaceName, reminders, unconfigured };
}

/** Lembretes de todos os ambientes, para o aviso visual global. */
export async function getAllReminders(
  spaces: { id: string; name: string }[],
  today = new Date().toISOString().slice(0, 10),
): Promise<SpaceReminders[]> {
  return Promise.all(spaces.map((s) => getSpaceReminders(s.id, s.name, today)));
}

/** Só os que exigem ação, é isto que se mostra no painel principal. */
export function pendingReminders(all: SpaceReminders[]): {
  spaceId: string;
  spaceName: string;
  status: ReminderStatus;
}[] {
  return all
    .flatMap((s) =>
      s.reminders
        .filter((r) => r.state === "overdue" || r.state === "due" || r.state === "never")
        .map((status) => ({ spaceId: s.spaceId, spaceName: s.spaceName, status })),
    )
    .sort((a, b) => b.status.overdueDays - a.status.overdueDays);
}
