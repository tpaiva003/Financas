/**
 * Serviço de relatórios: agrega despesas por categoria, mês e participante.
 * Considera despesas confirmadas e não eliminadas do ambiente.
 */

import { getRepository } from "@/lib/data";
import type { Member, Category } from "@/lib/data";
import {
  buildAverages,
  buildMonthComparison,
  computeShares,
  type AveragesResult,
  type BaselineMode,
  type MonthComparison,
  type MonthlyAmount,
} from "@/lib/domain";
import { identifyMerchant } from "@/lib/domain";

export interface Slice {
  key: string;
  label: string;
  color: string;
  amountCents: number;
}

export interface SpaceReport {
  totalCents: number;
  /** Quanto do total é partilhado e quanto é pessoal (do próprio). */
  sharedCents: number;
  personalCents: number;
  /** A parte do utilizador: quota nas partilhadas + as pessoais dele. */
  myShareCents: number;
  byCategory: Slice[];
  byMonth: Slice[];
  byPayer: Slice[];
  /** Onde se gasta mais, agrupado por comerciante. */
  byMerchant: Slice[];
  count: number;
  comparison: MonthComparison;
  periodLabel: string;
  /** Média mensal por categoria + metas, para o mês em análise. */
  categoryAverages: AveragesResult;
  /** O mesmo, mas por comerciante ("média do supermercado X"). */
  merchantAverages: AveragesResult;
  /** Quantos meses entram nas médias. */
  averageWindowMonths: number;
}

/** Chave usada para a meta do ambiente inteiro (a categoria é nula na BD). */
export const TOTAL_GOAL_KEY = "__total__";

/** Períodos disponíveis no seletor dos relatórios. */
export const REPORT_PERIODS = [
  { id: "3m", label: "3 meses", months: 3 },
  { id: "6m", label: "6 meses", months: 6 },
  { id: "12m", label: "12 meses", months: 12 },
  { id: "tudo", label: "Tudo", months: 0 },
] as const;

export type ReportPeriodId = (typeof REPORT_PERIODS)[number]["id"];

/** Primeira data incluída no período (ISO), ou null se for "tudo". */
function periodStart(months: number): string | null {
  if (months <= 0) return null;
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - (months - 1));
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

const MONTHS_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export async function getSpaceReport(
  spaceId: string,
  viewerMemberId: string,
  members: Member[],
  categories: Category[],
  periodId: ReportPeriodId = "12m",
  baseline: BaselineMode = "previous",
  /** Nº de meses anteriores que entram nas médias por categoria. */
  averageWindow = 3,
): Promise<SpaceReport> {
  const repo = getRepository();
  const period = REPORT_PERIODS.find((p) => p.id === periodId) ?? REPORT_PERIODS[2];
  const from = periodStart(period.months);

  const allExpenses = (await repo.listExpenses({ spaceId, viewerId: viewerMemberId })).filter(
    (e) =>
      e.status === "confirmed" &&
      e.approvalStatus !== "pending" &&
      e.approvalStatus !== "rejected",
  );
  const expenses = allExpenses.filter(
    (e) =>
      from === null || e.transactionDate >= from,
  );

  // A "minha parte": quota nas partilhadas mais as pessoais do próprio.
  const participantIds = members.map((m) => m.id);
  let sharedCents = 0;
  let personalCents = 0;
  let myShareCents = 0;
  const merchantTotals = new Map<string, { label: string; cents: number }>();

  const catMap = new Map(categories.map((c) => [c.id, c]));
  const memberMap = new Map(members.map((m) => [m.id, m]));

  const catTotals = new Map<string, number>();
  const monthTotals = new Map<string, number>();
  const payerTotals = new Map<string, number>();
  let total = 0;

  for (const e of expenses) {
    total += e.amountCents;

    if (e.kind === "shared") {
      sharedCents += e.amountCents;
      try {
        myShareCents += computeShares(e.amountCents, e.split, participantIds)[viewerMemberId] ?? 0;
      } catch {
        // Divisão inconsistente com os participantes atuais: não conta.
      }
    } else if (e.ownerId === viewerMemberId) {
      personalCents += e.amountCents;
      myShareCents += e.amountCents;
    }

    // Agrupa por comerciante: marcas conhecidas primeiro, depois palavras.
    // É isto que faz "Continente Modelo" e "Cont Bom Dia" contarem juntos.
    const merchant = identifyMerchant(e.description);
    const mKey = merchant.key || e.description.toLowerCase();
    const cur = merchantTotals.get(mKey);
    if (cur) cur.cents += e.amountCents;
    else merchantTotals.set(mKey, { label: merchant.label, cents: e.amountCents });
    const cat = e.categoryId ?? "outros";
    catTotals.set(cat, (catTotals.get(cat) ?? 0) + e.amountCents);
    const ym = e.transactionDate.slice(0, 7); // YYYY-MM
    monthTotals.set(ym, (monthTotals.get(ym) ?? 0) + e.amountCents);
    payerTotals.set(e.payerId, (payerTotals.get(e.payerId) ?? 0) + e.amountCents);
  }

  const byCategory: Slice[] = [...catTotals.entries()]
    .map(([key, amountCents]) => ({
      key,
      label: catMap.get(key)?.name ?? "Sem categoria",
      color: catMap.get(key)?.color ?? "#64748b",
      amountCents,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const byMonth: Slice[] = [...monthTotals.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, amountCents]) => {
      const [y, m] = key.split("-");
      return {
        key,
        label: `${MONTHS_PT[Number(m) - 1]} ${y!.slice(2)}`,
        color: "#3377f6",
        amountCents,
      };
    });

  const palette = ["#3377f6", "#62d196", "#f0746f", "#db2777", "#7c3aed", "#ea580c"];
  const byPayer: Slice[] = [...payerTotals.entries()]
    .map(([key, amountCents], i) => ({
      key,
      label: memberMap.get(key)?.name ?? key,
      color: palette[i % palette.length]!,
      amountCents,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);

  /**
   * Se o mês em análise é o mês corrente, ainda vai a meio: corta-se no dia de
   * hoje para a referência comparar os mesmos dias. Meses passados contam
   * inteiros — um mês onde se deixou de gastar ao dia 20 está completo, e
   * cortá-lo encolhia a referência sem razão nenhuma.
   *
   * Vale para as médias **e** para a comparação mês-a-mês. Ia só às médias, e
   * por isso o ecrã do "este mês vs o anterior" anunciava quedas de 75% que
   * eram só calendário.
   */
  const today = new Date();
  const todayYm = today.toISOString().slice(0, 7);
  const analysedMonth =
    [...new Set(allExpenses.map((e) => e.transactionDate.slice(0, 7)))].sort().at(-1) ?? null;
  const throughDay = analysedMonth === todayYm ? today.getUTCDate() : null;

  // A comparação usa TODO o histórico (o homólogo precisa do ano anterior),
  // mesmo quando os totais mostrados são só do período escolhido.
  const comparison = buildMonthComparison(
    allExpenses.map((e) => ({
      amountCents: e.amountCents,
      transactionDate: e.transactionDate,
      categoryId: e.categoryId ?? null,
    })),
    categories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
    3,
    baseline,
    throughDay,
  );

  const byMerchant: Slice[] = [...merchantTotals.entries()]
    .map(([key, v]) => ({ key, label: v.label, color: "#7c3aed", amountCents: v.cents }))
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 8);

  // Médias mensais e metas. Usam todo o histórico (a média precisa dos meses
  // anteriores ao atual, que podem cair fora do período escolhido).
  const goals = await repo.listSpendingGoals(spaceId).catch(() => []);
  const goalsByKey: Record<string, number> = {};
  for (const g of goals) {
    goalsByKey[g.categoryId ?? TOTAL_GOAL_KEY] = g.amountCents;
  }

  const monthlyByCategory: MonthlyAmount[] = allExpenses.map((e) => {
    const key = e.categoryId ?? "outros";
    return {
      key,
      label: catMap.get(key)?.name ?? "Sem categoria",
      color: catMap.get(key)?.color ?? "#64748b",
      date: e.transactionDate,
      amountCents: e.amountCents,
    };
  });

  const monthlyByMerchant: MonthlyAmount[] = allExpenses.map((e) => {
    const m = identifyMerchant(e.description);
    return {
    key: m.key || e.description.toLowerCase(),
    label: m.label,
    color: "#7c3aed",
    date: e.transactionDate,
    amountCents: e.amountCents,
    };
  });

  const categoryAverages = buildAverages(monthlyByCategory, {
    windowMonths: averageWindow,
    goals: goalsByKey,
    throughDay,
  });
  const merchantAverages = buildAverages(monthlyByMerchant, {
    windowMonths: averageWindow,
    throughDay,
  });

  return {
    categoryAverages,
    merchantAverages,
    averageWindowMonths: averageWindow,
    totalCents: total,
    sharedCents,
    personalCents,
    myShareCents,
    byCategory,
    byMonth,
    byPayer,
    byMerchant,
    count: expenses.length,
    comparison,
    periodLabel: period.label,
  };
}
