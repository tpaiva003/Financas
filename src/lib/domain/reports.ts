/**
 * Lógica pura de relatórios temporais (sem acesso a dados): comparação
 * mês-a-mês por categoria e média móvel do total mensal.
 *
 * Trabalha sobre uma forma mínima de despesa para ser facilmente testável.
 */

const MONTHS_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** Despesa reduzida ao necessário para os relatórios temporais. */
export interface ReportExpense {
  amountCents: number;
  transactionDate: string; // YYYY-MM-DD
  categoryId: string | null;
}

export interface CategoryInfo {
  id: string;
  name: string;
  color?: string | null;
}

export interface CategoryDelta {
  key: string;
  label: string;
  color: string;
  currentCents: number;
  previousCents: number;
  /** current - previous (positivo = subiu). */
  deltaCents: number;
  /** Variação percentual; null quando não havia base no mês anterior. */
  deltaPct: number | null;
}

/** Contra o que se compara o mês atual. */
export type BaselineMode = "previous" | "average" | "yoy";

/** Um mês da série, para o gráfico. */
export interface MonthPoint {
  ym: string;
  label: string;
  totalCents: number;
}

export interface MonthComparison {
  /** Mês de referência ("YYYY-MM"), o mais recente com despesas, ou null. */
  currentMonth: string | null;
  previousMonth: string | null;
  currentLabel: string;
  previousLabel: string;
  currentTotalCents: number;
  previousTotalCents: number;
  totalDeltaCents: number;
  totalDeltaPct: number | null;
  categories: CategoryDelta[];
  /** Média móvel do total mensal sobre os últimos `movingAvgMonths` meses com dados. */
  movingAvgCents: number;
  movingAvgMonths: number;
  /** current - médiaMóvel (positivo = acima da média recente). */
  vsAverageCents: number;

  /** Modo escolhido e a referência correspondente. */
  baseline: BaselineMode;
  baselineLabel: string;
  baselineTotalCents: number;
  baselineDeltaCents: number;
  baselineDeltaPct: number | null;
  /** Mês homólogo (mesmo mês do ano anterior), se existir na série. */
  sameMonthLastYear: string | null;
  /** Série mensal completa, para desenhar. */
  series: MonthPoint[];
}

const FALLBACK_COLOR = "#64748b";

/** Rótulo curto de um mês "YYYY-MM" (ex.: "jun 26"). */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const idx = Number(m) - 1;
  if (!y || idx < 0 || idx > 11) return ym;
  return `${MONTHS_PT[idx]} ${y.slice(2)}`;
}

/** Mês civil imediatamente anterior a "YYYY-MM". */
export function previousMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Mesmo mês do ano anterior ("2026-07" -> "2025-07"). */
export function sameMonthLastYear(ym: string): string {
  const [y, m] = ym.split("-");
  return `${Number(y) - 1}-${m}`;
}

function pct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Constrói a comparação mês-a-mês. O "mês atual" é o mês mais recente com
 * despesas (e não a data de calendário), para o relatório ser sempre útil
 * mesmo que o mês corrente ainda não tenha registos.
 *
 * @param movingWindow nº de meses (com dados) para a média móvel (default 3).
 */
export function buildMonthComparison(
  expenses: ReportExpense[],
  categories: CategoryInfo[],
  movingWindow = 3,
  baseline: BaselineMode = "previous",
): MonthComparison {
  const catMap = new Map(categories.map((c) => [c.id, c]));

  // Total por mês e total por (mês, categoria).
  const monthTotals = new Map<string, number>();
  const monthCat = new Map<string, Map<string, number>>();

  for (const e of expenses) {
    const ym = e.transactionDate.slice(0, 7);
    monthTotals.set(ym, (monthTotals.get(ym) ?? 0) + e.amountCents);
    const catKey = e.categoryId ?? "__none__";
    let inner = monthCat.get(ym);
    if (!inner) {
      inner = new Map<string, number>();
      monthCat.set(ym, inner);
    }
    inner.set(catKey, (inner.get(catKey) ?? 0) + e.amountCents);
  }

  const monthsWithData = [...monthTotals.keys()].sort();
  const currentMonth = monthsWithData.at(-1) ?? null;

  if (!currentMonth) {
    return {
      currentMonth: null,
      previousMonth: null,
      currentLabel: "",
      previousLabel: "",
      currentTotalCents: 0,
      previousTotalCents: 0,
      totalDeltaCents: 0,
      totalDeltaPct: null,
      categories: [],
      movingAvgCents: 0,
      movingAvgMonths: 0,
      vsAverageCents: 0,
      baseline,
      baselineLabel: "",
      baselineTotalCents: 0,
      baselineDeltaCents: 0,
      baselineDeltaPct: null,
      sameMonthLastYear: null,
      series: [],
    };
  }

  const prevMonth = previousMonth(currentMonth);
  const yoyMonth = sameMonthLastYear(currentMonth);
  const curCats = monthCat.get(currentMonth) ?? new Map<string, number>();

  // Meses ANTERIORES ao atual (a média não se compara consigo própria).
  const earlier = monthsWithData.filter((m) => m < currentMonth);
  const avgWindow = earlier.slice(-movingWindow);
  const avgOf = (get: (m: string) => number) =>
    avgWindow.length > 0
      ? Math.round(avgWindow.reduce((acc, m) => acc + get(m), 0) / avgWindow.length)
      : 0;

  /** Valor de referência de uma categoria, conforme o modo. */
  const baseCat = (key: string): number => {
    if (baseline === "yoy") return monthCat.get(yoyMonth)?.get(key) ?? 0;
    if (baseline === "average") return avgOf((m) => monthCat.get(m)?.get(key) ?? 0);
    return monthCat.get(prevMonth)?.get(key) ?? 0;
  };

  const prvCats = monthCat.get(prevMonth) ?? new Map<string, number>();

  const baseCatsKeys =
    baseline === "yoy"
      ? [...(monthCat.get(yoyMonth)?.keys() ?? [])]
      : baseline === "average"
        ? avgWindow.flatMap((m) => [...(monthCat.get(m)?.keys() ?? [])])
        : [...prvCats.keys()];
  const keys = new Set<string>([...curCats.keys(), ...baseCatsKeys]);
  const categoriesOut: CategoryDelta[] = [...keys]
    .map((key) => {
      const info = key === "__none__" ? undefined : catMap.get(key);
      const currentCents = curCats.get(key) ?? 0;
      const previousCents = baseCat(key);
      return {
        key,
        label: info?.name ?? "Sem categoria",
        color: info?.color ?? FALLBACK_COLOR,
        currentCents,
        previousCents,
        deltaCents: currentCents - previousCents,
        deltaPct: pct(currentCents, previousCents),
      };
    })
    .sort(
      (a, b) =>
        Math.abs(b.deltaCents) - Math.abs(a.deltaCents) ||
        b.currentCents - a.currentCents,
    );

  // Média móvel: média dos totais dos últimos `movingWindow` meses COM dados,
  // terminando no mês atual (inclusive).
  const window = monthsWithData.slice(-movingWindow);
  const windowSum = window.reduce((acc, m) => acc + (monthTotals.get(m) ?? 0), 0);
  const movingAvgMonths = window.length;
  const movingAvgCents = movingAvgMonths > 0 ? Math.round(windowSum / movingAvgMonths) : 0;

  const currentTotalCents = monthTotals.get(currentMonth) ?? 0;
  const previousTotalCents = monthTotals.get(prevMonth) ?? 0;

  // Média dos meses anteriores (exclui o atual, para a comparação ser honesta).
  const baseAvgCents = avgOf((m) => monthTotals.get(m) ?? 0);
  const yoyTotalCents = monthTotals.get(yoyMonth) ?? 0;

  const baselineTotalCents =
    baseline === "yoy" ? yoyTotalCents : baseline === "average" ? baseAvgCents : previousTotalCents;
  const baselineLabel =
    baseline === "yoy"
      ? monthLabel(yoyMonth)
      : baseline === "average"
        ? `média de ${avgWindow.length} ${avgWindow.length === 1 ? "mês" : "meses"}`
        : monthLabel(prevMonth);

  const series: MonthPoint[] = monthsWithData.map((ym) => ({
    ym,
    label: monthLabel(ym),
    totalCents: monthTotals.get(ym) ?? 0,
  }));

  return {
    currentMonth,
    previousMonth: prevMonth,
    currentLabel: monthLabel(currentMonth),
    previousLabel: monthLabel(prevMonth),
    currentTotalCents,
    previousTotalCents,
    totalDeltaCents: currentTotalCents - previousTotalCents,
    totalDeltaPct: pct(currentTotalCents, previousTotalCents),
    categories: categoriesOut,
    baseline,
    baselineLabel,
    baselineTotalCents,
    baselineDeltaCents: currentTotalCents - baselineTotalCents,
    baselineDeltaPct: pct(currentTotalCents, baselineTotalCents),
    sameMonthLastYear: monthTotals.has(yoyMonth) ? yoyMonth : null,
    series,
    movingAvgCents,
    movingAvgMonths,
    vsAverageCents: currentTotalCents - movingAvgCents,
  };
}
