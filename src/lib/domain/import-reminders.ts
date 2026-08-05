/**
 * Lembretes de importação (REQ-IMP-8).
 *
 * O problema real: passam semanas e já não se sabe se o extrato daquele banco
 * foi importado nem a partir de que dia se deve importar. Estas funções são
 * PURAS: dado o último import de cada banco e a periodicidade escolhida, dizem
 * quando é o próximo, se está atrasado e qual a primeira data a considerar.
 */

export type ImportFrequency = "weekly" | "monthly" | "quarterly";

export const FREQUENCY_LABELS: Record<ImportFrequency, string> = {
  weekly: "Semanal",
  monthly: "Mensal",
  quarterly: "Trimestral",
};

export type ReminderState = "never" | "overdue" | "due" | "ok";

export interface ReminderInput {
  source: string;
  label?: string | null;
  frequency: ImportFrequency;
  /** Quando foi feita a última importação deste banco (data do lote). */
  lastImportAt: string | null;
  /** Data da transação mais recente já importada deste banco. */
  lastTransactionDate: string | null;
}

export interface ReminderStatus extends ReminderInput {
  /** Data em que o próximo import deve acontecer. */
  nextDueDate: string | null;
  /** Dias de atraso (0 se ainda não está atrasado). */
  overdueDays: number;
  state: ReminderState;
  /**
   * Primeira data a considerar no próximo ficheiro: o dia a seguir à última
   * transação importada. É a resposta a "desde quando devo importar?".
   */
  fromDate: string | null;
  /** Frase curta para mostrar na app. */
  message: string;
}

const DAY_MS = 86_400_000;

/** Só a parte da data (YYYY-MM-DD), para comparar sem fusos horários pelo meio. */
export function toDateOnly(value: string): string {
  return value.slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${toDateOnly(date)}T00:00:00Z`);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number): string {
  const [y, m, d] = toDateOnly(date).split("-").map(Number) as [number, number, number];
  // Dia 31 + 1 mês num mês de 30 dias fica no último dia desse mês, não no 1 do
  // seguinte: um lembrete não deve saltar um mês por causa do calendário.
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

function advance(date: string, frequency: ImportFrequency): string {
  if (frequency === "weekly") return addDays(date, 7);
  if (frequency === "quarterly") return addMonths(date, 3);
  return addMonths(date, 1);
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(`${toDateOnly(from)}T00:00:00Z`).getTime();
  const b = new Date(`${toDateOnly(to)}T00:00:00Z`).getTime();
  return Math.round((b - a) / DAY_MS);
}

/** Quantos dias antes do prazo já avisamos ("está quase"). */
const SOON_DAYS = 3;

export function reminderStatus(input: ReminderInput, today: string): ReminderStatus {
  const now = toDateOnly(today);
  const fromDate = input.lastTransactionDate ? addDays(input.lastTransactionDate, 1) : null;
  const name = input.label || input.source;

  if (!input.lastImportAt) {
    return {
      ...input,
      nextDueDate: null,
      overdueDays: 0,
      state: "never",
      fromDate,
      message: `Ainda não importaste nada de ${name}.`,
    };
  }

  const nextDueDate = advance(toDateOnly(input.lastImportAt), input.frequency);
  const diff = daysBetween(now, nextDueDate); // negativo = já passou

  if (diff < 0) {
    const overdueDays = -diff;
    return {
      ...input,
      nextDueDate,
      overdueDays,
      state: "overdue",
      fromDate,
      message:
        overdueDays === 1
          ? `${name}: atrasado 1 dia.`
          : `${name}: atrasado ${overdueDays} dias.`,
    };
  }

  if (diff <= SOON_DAYS) {
    return {
      ...input,
      nextDueDate,
      overdueDays: 0,
      state: "due",
      fromDate,
      message: diff === 0 ? `${name}: importar hoje.` : `${name}: importar em ${diff} dia(s).`,
    };
  }

  return {
    ...input,
    nextDueDate,
    overdueDays: 0,
    state: "ok",
    fromDate,
    message: `${name}: em dia. Próximo a ${formatPt(nextDueDate)}.`,
  };
}

function formatPt(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/** Ordena por urgência: atrasados primeiro, depois quase a vencer. */
export function sortByUrgency(list: ReminderStatus[]): ReminderStatus[] {
  const rank: Record<ReminderState, number> = { overdue: 0, due: 1, never: 2, ok: 3 };
  return [...list].sort(
    (a, b) => rank[a.state] - rank[b.state] || b.overdueDays - a.overdueDays,
  );
}
