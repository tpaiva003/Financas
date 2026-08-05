/**
 * Médias mensais por grupo (categoria ou comerciante) e metas.
 *
 * Responde à pergunta "quanto gasto por mês no supermercado, e como está este
 * mês?". Lógica pura, sem acesso a dados.
 *
 * Nota sobre o denominador da média: divide-se pelo número de MESES da janela
 * (meses em que o ambiente teve movimento), não pelo número de meses em que
 * aquela categoria teve movimento. Caso contrário uma categoria comprada uma
 * vez em seis meses mostraria uma "média mensal" igual a essa única compra.
 */

export interface MonthlyAmount {
  key: string;
  label: string;
  color?: string | null;
  /** Mês da despesa, "YYYY-MM". */
  ym: string;
  amountCents: number;
}

export type GoalState = "none" | "under" | "near" | "over";

export interface AverageRow {
  key: string;
  label: string;
  color: string;
  /** Total do mês em análise. */
  currentCents: number;
  /** Média mensal nos meses de referência (não inclui o mês em análise). */
  averageCents: number;
  /** Quantos meses entraram na média. */
  monthsCounted: number;
  /** current - média (positivo = acima do costume). */
  deltaCents: number;
  deltaPct: number | null;
  /** Meta mensal definida para este grupo, se houver. */
  goalCents: number | null;
  /** Percentagem da meta já gasta (100 = em cima da meta). */
  goalPct: number | null;
  goalState: GoalState;
  /** Quanto falta para a meta (negativo = já passou). */
  goalRemainingCents: number | null;
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

export interface AveragesOptions {
  /** Mês em análise ("YYYY-MM"). Por omissão, o mais recente com dados. */
  currentMonth?: string | null;
  /** Quantos meses anteriores entram na média (default 3). */
  windowMonths?: number;
  /** Metas por chave de grupo. */
  goals?: Record<string, number>;
}

export interface AveragesResult {
  currentMonth: string | null;
  monthsCounted: number;
  rows: AverageRow[];
  /** Totais do ambiente, com a mesma leitura das linhas. */
  total: AverageRow | null;
}

export function buildAverages(
  data: MonthlyAmount[],
  options: AveragesOptions = {},
): AveragesResult {
  const { windowMonths = 3, goals = {} } = options;

  const months = [...new Set(data.map((d) => d.ym))].sort();
  const currentMonth = options.currentMonth ?? months.at(-1) ?? null;
  if (!currentMonth) {
    return { currentMonth: null, monthsCounted: 0, rows: [], total: null };
  }

  // Só meses ANTERIORES: o mês em análise ainda pode estar a meio e puxaria a
  // média para baixo, tornando a comparação inútil.
  const window = months.filter((m) => m < currentMonth).slice(-windowMonths);
  const monthsCounted = window.length;
  const inWindow = new Set(window);

  const meta = new Map<string, { label: string; color: string }>();
  const current = new Map<string, number>();
  const windowSum = new Map<string, number>();
  let currentTotal = 0;
  let windowTotal = 0;

  for (const d of data) {
    if (!meta.has(d.key)) meta.set(d.key, { label: d.label, color: d.color ?? FALLBACK_COLOR });
    if (d.ym === currentMonth) {
      current.set(d.key, (current.get(d.key) ?? 0) + d.amountCents);
      currentTotal += d.amountCents;
    } else if (inWindow.has(d.ym)) {
      windowSum.set(d.key, (windowSum.get(d.key) ?? 0) + d.amountCents);
      windowTotal += d.amountCents;
    }
  }

  const avg = (sum: number) => (monthsCounted > 0 ? Math.round(sum / monthsCounted) : 0);

  const row = (key: string, label: string, color: string, cur: number, sum: number): AverageRow => {
    const averageCents = avg(sum);
    const goalCents = goals[key] ?? null;
    return {
      key,
      label,
      color,
      currentCents: cur,
      averageCents,
      monthsCounted,
      deltaCents: cur - averageCents,
      deltaPct: averageCents === 0 ? null : ((cur - averageCents) / Math.abs(averageCents)) * 100,
      goalCents,
      goalPct: goalCents && goalCents > 0 ? (cur / goalCents) * 100 : null,
      goalState: goalState(cur, goalCents),
      goalRemainingCents: goalCents && goalCents > 0 ? goalCents - cur : null,
    };
  };

  const keys = new Set<string>([...current.keys(), ...windowSum.keys(), ...Object.keys(goals)]);
  keys.delete("__total__");

  const rows = [...keys]
    .map((key) => {
      const info = meta.get(key);
      return row(
        key,
        info?.label ?? key,
        info?.color ?? FALLBACK_COLOR,
        current.get(key) ?? 0,
        windowSum.get(key) ?? 0,
      );
    })
    // Primeiro o que está acima da meta, depois o que mais subiu face à média.
    .sort(
      (a, b) =>
        Number(b.goalState === "over") - Number(a.goalState === "over") ||
        b.currentCents - a.currentCents,
    );

  return {
    currentMonth,
    monthsCounted,
    rows,
    total: row("__total__", "Total do ambiente", FALLBACK_COLOR, currentTotal, windowTotal),
  };
}
