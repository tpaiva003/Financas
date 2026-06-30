/**
 * Lógica pura de recorrência (sem acesso a dados): cálculo da próxima data e
 * enumeração das ocorrências em atraso até uma data de referência.
 *
 * Datas em ISO "YYYY-MM-DD" (comparáveis lexicograficamente).
 */

export type Frequency = "weekly" | "monthly" | "yearly";

const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
};

export function frequencyLabel(freq: Frequency): string {
  return FREQUENCY_LABELS[freq] ?? freq;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month1: number): number {
  // month1: 1..12
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Soma `n` meses a uma data, fixando o dia ao último dia do mês destino. */
function addMonths(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const total = (m! - 1) + n;
  const ny = y! + Math.floor(total / 12);
  const nm0 = ((total % 12) + 12) % 12; // 0..11
  const dim = daysInMonth(ny, nm0 + 1);
  const nd = Math.min(d!, dim);
  return `${ny}-${pad(nm0 + 1)}-${pad(nd)}`;
}

/** Próxima ocorrência a partir de uma data, dada a frequência. */
export function nextOccurrence(isoDate: string, freq: Frequency): string {
  if (freq === "weekly") {
    const [y, m, d] = isoDate.split("-").map(Number);
    const dt = new Date(Date.UTC(y!, m! - 1, d!));
    dt.setUTCDate(dt.getUTCDate() + 7);
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }
  if (freq === "yearly") return addMonths(isoDate, 12);
  return addMonths(isoDate, 1);
}

export interface EnumerateInput {
  nextDate: string;
  frequency: Frequency;
  asOf: string;
  endDate?: string | null;
  /** Limite de segurança para evitar ciclos longos. */
  cap?: number;
}

export interface EnumerateResult {
  /** Datas de ocorrência em atraso (<= asOf), por ordem cronológica. */
  occurrences: string[];
  /** Próxima data por gerar (depois das ocorrências devolvidas). */
  nextDate: string;
  /** A recorrência terminou (ultrapassou a data de fim)? */
  finished: boolean;
}

/**
 * Enumera as ocorrências em atraso desde `nextDate` até `asOf` (inclusive),
 * respeitando `endDate`. Devolve também a próxima data por gerar.
 */
export function enumerateDue({
  nextDate,
  frequency,
  asOf,
  endDate = null,
  cap = 120,
}: EnumerateInput): EnumerateResult {
  const occurrences: string[] = [];
  let cur = nextDate;
  let i = 0;
  while (cur <= asOf && (!endDate || cur <= endDate) && i < cap) {
    occurrences.push(cur);
    cur = nextOccurrence(cur, frequency);
    i += 1;
  }
  const finished = Boolean(endDate) && cur > (endDate as string);
  return { occurrences, nextDate: cur, finished };
}
