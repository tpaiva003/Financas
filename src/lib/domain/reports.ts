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

export interface MonthComparison {
  /** Mês de referência ("YYYY-MM") — o mais recente com despesas, ou null. */
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
    };
  }

  const prevMonth = previousMonth(currentMonth);
  const curCats = monthCat.get(currentMonth) ?? new Map<string, number>();
  const prvCats = monthCat.get(prevMonth) ?? new Map<string, number>();

  const keys = new Set<string>([...curCats.keys(), ...prvCats.keys()]);
  const categoriesOut: CategoryDelta[] = [...keys]
    .map((key) => {
      const info = key === "__none__" ? undefined : catMap.get(key);
      const currentCents = curCats.get(key) ?? 0;
      const previousCents = prvCats.get(key) ?? 0;
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
    movingAvgCents,
    movingAvgMonths,
    vsAverageCents: currentTotalCents - movingAvgCents,
  };
}
