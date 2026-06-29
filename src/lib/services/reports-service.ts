/**
 * Serviço de relatórios: agrega despesas por categoria, mês e participante.
 * Considera despesas confirmadas e não eliminadas do ambiente.
 */

import { getRepository } from "@/lib/data";
import type { Member, Category } from "@/lib/data";
import { buildMonthComparison, type MonthComparison } from "@/lib/domain";

export interface Slice {
  key: string;
  label: string;
  color: string;
  amountCents: number;
}

export interface SpaceReport {
  totalCents: number;
  byCategory: Slice[];
  byMonth: Slice[];
  byPayer: Slice[];
  count: number;
  comparison: MonthComparison;
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
): Promise<SpaceReport> {
  const repo = getRepository();
  const expenses = (await repo.listExpenses({ spaceId, viewerId: viewerMemberId })).filter(
    (e) => e.status === "confirmed",
  );

  const catMap = new Map(categories.map((c) => [c.id, c]));
  const memberMap = new Map(members.map((m) => [m.id, m]));

  const catTotals = new Map<string, number>();
  const monthTotals = new Map<string, number>();
  const payerTotals = new Map<string, number>();
  let total = 0;

  for (const e of expenses) {
    total += e.amountCents;
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

  const comparison = buildMonthComparison(
    expenses.map((e) => ({
      amountCents: e.amountCents,
      transactionDate: e.transactionDate,
      categoryId: e.categoryId ?? null,
    })),
    categories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
  );

  return { totalCents: total, byCategory, byMonth, byPayer, count: expenses.length, comparison };
}
