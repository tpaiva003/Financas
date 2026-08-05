/**
 * Médias mensais por grupo (categoria ou comerciante), homólogo e metas.
 *
 * Responde a "quanto costumo gastar por mês no supermercado, e como está este
 * mês?", e, sobretudo, torna a comparação justa quando o mês ainda vai a meio:
 * a 5 de agosto compara-se com os primeiros 5 dias de agosto do ano passado,
 * não com o mês inteiro. Lógica pura, sem acesso a dados.
 *
 * Duas decisões que mudam os números:
 *
 * 1. O mês em análise NUNCA entra na sua própria média. Está quase sempre a
 *    meio e puxaria a referência para baixo, escondendo o excesso.
 * 2. A média divide pelos MESES DA JANELA, não pelos meses em que aquele grupo
 *    teve movimento. Senão uma compra esporádica (uma vez em seis meses)
 *    aparecia como se fosse um hábito mensal.
 */

export interface MonthlyAmount {
  key: string;
  label: string;
  color?: string | null;
  /** Data da despesa, "YYYY-MM-DD". */
  date: string;
  amountCents: number;
}

export type GoalState = "none" | "under" | "near" | "over";

export interface AverageRow {
  key: string;
  label: string;
  color: string;
  /** Total do mês em análise (até ao dia analisado, se o mês for parcial). */
  currentCents: number;
  /** Média mensal COMPLETA nos meses de referência. */
  averageCents: number;
  /** A mesma média, contando só os dias até ao dia analisado. */
  averageToDayCents: number;
  /** Quantos meses entraram na média. */
  monthsCounted: number;
  /** current - média completa (positivo = acima do costume). */
  deltaCents: number;
  deltaPct: number | null;
  /** Mesmo mês do ano anterior, completo. Null se esse mês não existe nos dados. */
  yoyCents: number | null;
  /** Mesmo mês do ano anterior, até ao mesmo dia, a comparação justa. */
  yoyToDayCents: number | null;
  /** current - homólogo até ao mesmo dia. */
  yoyDeltaCents: number | null;
  yoyDeltaPct: number | null;
  /** Meta mensal definida para este grupo, se houver. */
  goalCents: number | null;
  goalPct: number | null;
  goalState: GoalState;
  /** Quanto falta para a meta (negativo = já passou). */
  goalRemainingCents: number | null;
}

export interface AveragesResult {
  currentMonth: string | null;
  /** Mês homólogo ("YYYY-MM"), esteja ou não presente nos dados. */
  yoyMonth: string | null;
  monthsCounted: number;
  /** Dia do mês até onde o mês em análise conta. */
  throughDay: number;
  /** O mês em análise ainda não acabou. */
  partial: boolean;
  rows: AverageRow[];
  /** Totais do ambiente, com a mesma leitura das linhas. */
  total: AverageRow | null;
}

const FALLBACK_COLOR = "#64748b";

/** A partir de que percentagem da meta se avisa que está perto. */
const NEAR_THRESHOLD = 0.8;

export function goalState(currentCents: number, goalCents: number | null): GoalState {
  if (goalCents === null || goalCents <= 0) return "none";
  if (currentCents > goalCents) return "over";
  if (currentCents >= goalCents * NEAR_THRESHOLD) return "near";
  return "under";
}

/** Nº de dias de um mês "YYYY-MM". */
export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
}

export interface AveragesOptions {
  /** Mês em análise ("YYYY-MM"). Por omissão, o mais recente com dados. */
  currentMonth?: string | null;
  /** Quantos meses anteriores entram na média (default 3). */
  windowMonths?: number;
  /** Metas por chave de grupo. */
  goals?: Record<string, number>;
  /**
   * Dia do mês até onde o mês em análise está preenchido. Por omissão, o mês
   * inteiro. Passar o dia de hoje é o que torna o homólogo comparável.
   */
  throughDay?: number | null;
}

function pct(current: number, base: number): number | null {
  if (base === 0) return null;
  return ((current - base) / Math.abs(base)) * 100;
}

export function buildAverages(
  data: MonthlyAmount[],
  options: AveragesOptions = {},
): AveragesResult {
  const { windowMonths = 3, goals = {} } = options;

  const months = [...new Set(data.map((d) => d.date.slice(0, 7)))].sort();
  const currentMonth = options.currentMonth ?? months.at(-1) ?? null;
  if (!currentMonth) {
    return {
      currentMonth: null,
      yoyMonth: null,
      monthsCounted: 0,
      throughDay: 31,
      partial: false,
      rows: [],
      total: null,
    };
  }

  const lastDay = daysInMonth(currentMonth);
  const throughDay = Math.min(Math.max(options.throughDay ?? lastDay, 1), lastDay);
  const partial = throughDay < lastDay;

  const [y, m] = currentMonth.split("-");
  const yoyMonth = `${Number(y) - 1}-${m}`;

  // Só meses ANTERIORES: o mês em análise não entra na sua própria média.
  const window = months.filter((mm) => mm < currentMonth).slice(-windowMonths);
  const monthsCounted = window.length;
  const inWindow = new Set(window);

  const meta = new Map<string, { label: string; color: string }>();
  const current = new Map<string, number>();
  const windowFull = new Map<string, number>();
  const windowToDay = new Map<string, number>();
  const yoyFull = new Map<string, number>();
  const yoyToDay = new Map<string, number>();
  let curT = 0;
  let winT = 0;
  let winDayT = 0;
  let yoyT = 0;
  let yoyDayT = 0;
  let yoyMonthHasData = false;

  const add = (map: Map<string, number>, key: string, cents: number) =>
    map.set(key, (map.get(key) ?? 0) + cents);

  for (const d of data) {
    const ym = d.date.slice(0, 7);
    const day = Number(d.date.slice(8, 10)) || 1;
    if (!meta.has(d.key)) meta.set(d.key, { label: d.label, color: d.color ?? FALLBACK_COLOR });

    if (ym === currentMonth) {
      if (day <= throughDay) {
        add(current, d.key, d.amountCents);
        curT += d.amountCents;
      }
    } else if (inWindow.has(ym)) {
      add(windowFull, d.key, d.amountCents);
      winT += d.amountCents;
      if (day <= throughDay) {
        add(windowToDay, d.key, d.amountCents);
        winDayT += d.amountCents;
      }
    }

    // O homólogo pode cair dentro ou fora da janela da média: conta à parte.
    if (ym === yoyMonth) {
      yoyMonthHasData = true;
      add(yoyFull, d.key, d.amountCents);
      yoyT += d.amountCents;
      if (day <= throughDay) {
        add(yoyToDay, d.key, d.amountCents);
        yoyDayT += d.amountCents;
      }
    }
  }

  const avg = (sum: number) => (monthsCounted > 0 ? Math.round(sum / monthsCounted) : 0);

  const row = (
    key: string,
    label: string,
    color: string,
    cur: number,
    sumFull: number,
    sumToDay: number,
    yoy: number,
    yoyDay: number,
  ): AverageRow => {
    const averageCents = avg(sumFull);
    const goalCents = goals[key] ?? null;
    const yoyCents = yoyMonthHasData ? yoy : null;
    const yoyToDayCents = yoyMonthHasData ? yoyDay : null;
    return {
      key,
      label,
      color,
      currentCents: cur,
      averageCents,
      averageToDayCents: avg(sumToDay),
      monthsCounted,
      deltaCents: cur - averageCents,
      deltaPct: pct(cur, averageCents),
      yoyCents,
      yoyToDayCents,
      yoyDeltaCents: yoyToDayCents === null ? null : cur - yoyToDayCents,
      yoyDeltaPct: yoyToDayCents === null ? null : pct(cur, yoyToDayCents),
      goalCents,
      goalPct: goalCents && goalCents > 0 ? (cur / goalCents) * 100 : null,
      goalState: goalState(cur, goalCents),
      goalRemainingCents: goalCents && goalCents > 0 ? goalCents - cur : null,
    };
  };

  const keys = new Set<string>([
    ...current.keys(),
    ...windowFull.keys(),
    ...yoyFull.keys(),
    ...Object.keys(goals),
  ]);
  keys.delete("__total__");

  const rows = [...keys]
    .map((key) => {
      const info = meta.get(key);
      return row(
        key,
        info?.label ?? key,
        info?.color ?? FALLBACK_COLOR,
        current.get(key) ?? 0,
        windowFull.get(key) ?? 0,
        windowToDay.get(key) ?? 0,
        yoyFull.get(key) ?? 0,
        yoyToDay.get(key) ?? 0,
      );
    })
    // Primeiro o que passou a meta (é um aviso), depois o que pesa mais.
    .sort(
      (a, b) =>
        Number(b.goalState === "over") - Number(a.goalState === "over") ||
        b.currentCents - a.currentCents,
    );

  return {
    currentMonth,
    yoyMonth,
    monthsCounted,
    throughDay,
    partial,
    rows,
    total: row("__total__", "Total do ambiente", FALLBACK_COLOR, curT, winT, winDayT, yoyT, yoyDayT),
  };
}
