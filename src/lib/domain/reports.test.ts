import { describe, it, expect } from "vitest";
import {
  buildMonthComparison,
  monthLabel,
  previousMonth,
  type ReportExpense,
  type CategoryInfo,
} from "./reports";

const cats: CategoryInfo[] = [
  { id: "merc", name: "Mercearia", color: "#0a0" },
  { id: "casa", name: "Casa", color: "#00a" },
];

function exp(date: string, cents: number, categoryId: string | null = null): ReportExpense {
  return { transactionDate: date, amountCents: cents, categoryId };
}

describe("monthLabel / previousMonth", () => {
  it("formata o mês em PT abreviado", () => {
    expect(monthLabel("2026-06")).toBe("jun 26");
    expect(monthLabel("2026-01")).toBe("jan 26");
    expect(monthLabel("2025-12")).toBe("dez 25");
  });

  it("recua um mês, atravessando o ano", () => {
    expect(previousMonth("2026-06")).toBe("2026-05");
    expect(previousMonth("2026-01")).toBe("2025-12");
  });
});

describe("buildMonthComparison", () => {
  it("devolve vazio sem despesas", () => {
    const r = buildMonthComparison([], cats);
    expect(r.currentMonth).toBeNull();
    expect(r.categories).toEqual([]);
    expect(r.movingAvgCents).toBe(0);
  });

  it("usa o mês mais recente com dados como referência", () => {
    const r = buildMonthComparison([exp("2026-04-10", 1000), exp("2026-06-10", 2000)], cats);
    expect(r.currentMonth).toBe("2026-06");
    expect(r.previousMonth).toBe("2026-05");
    expect(r.currentTotalCents).toBe(2000);
    // Maio não tem dados -> mês anterior = 0
    expect(r.previousTotalCents).toBe(0);
  });

  it("calcula o delta por categoria entre o mês atual e o anterior", () => {
    const r = buildMonthComparison(
      [
        exp("2026-05-05", 3000, "merc"),
        exp("2026-06-05", 5000, "merc"),
        exp("2026-06-20", 1000, "casa"),
      ],
      cats,
    );
    expect(r.currentMonth).toBe("2026-06");
    expect(r.previousMonth).toBe("2026-05");

    const merc = r.categories.find((c) => c.key === "merc")!;
    expect(merc.currentCents).toBe(5000);
    expect(merc.previousCents).toBe(3000);
    expect(merc.deltaCents).toBe(2000);
    expect(merc.deltaPct).toBeCloseTo(66.666, 1);

    const casa = r.categories.find((c) => c.key === "casa")!;
    expect(casa.currentCents).toBe(1000);
    expect(casa.previousCents).toBe(0);
    expect(casa.deltaPct).toBeNull(); // sem base no mês anterior
  });

  it("agrupa despesas sem categoria em 'Sem categoria'", () => {
    const r = buildMonthComparison([exp("2026-06-01", 1234, null)], cats);
    const none = r.categories.find((c) => c.key === "__none__")!;
    expect(none.label).toBe("Sem categoria");
    expect(none.currentCents).toBe(1234);
  });

  it("ordena por magnitude do delta", () => {
    const r = buildMonthComparison(
      [
        exp("2026-06-01", 100, "merc"),
        exp("2026-06-02", 9000, "casa"),
      ],
      cats,
    );
    expect(r.categories[0]!.key).toBe("casa");
  });

  it("média móvel = média dos últimos N meses com dados (inclui o atual)", () => {
    // abr=1000, mai=2000, jun=3000 -> média 3 meses = 2000
    const r = buildMonthComparison(
      [exp("2026-04-01", 1000), exp("2026-05-01", 2000), exp("2026-06-01", 3000)],
      cats,
      3,
    );
    expect(r.movingAvgMonths).toBe(3);
    expect(r.movingAvgCents).toBe(2000);
    expect(r.vsAverageCents).toBe(1000); // jun (3000) acima da média (2000)
  });

  it("limita a janela aos últimos N meses com dados", () => {
    // jan..jun a 1200 cada; janela 3 -> média dos últimos 3 = 1200
    const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
    const r = buildMonthComparison(
      months.map((m) => exp(`${m}-01`, 1200)),
      cats,
      3,
    );
    expect(r.movingAvgMonths).toBe(3);
    expect(r.movingAvgCents).toBe(1200);
  });
});
