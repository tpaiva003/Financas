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
  it("um mês a meio não se compara com um mês anterior inteiro", () => {
    /**
     * A 10 de agosto, com 200 € gastos, o ecrã dizia "-75% vs julho" — porque
     * punha 200 € contra os 800 € de julho **inteiro**. A queda não existe:
     * faltam vinte dias de agosto para acontecer.
     *
     * É o mesmo erro que o `buildAverages` já não comete, e a página do "o mês
     * comparado com o que é normal" promete precisamente que não o comete. O
     * `reports-service` até já calculava o dia de corte certo — só não o
     * passava a esta função.
     */
    const despesas = [
      // Julho: 200 € nos primeiros dez dias, 600 € depois.
      { amountCents: 10_000, transactionDate: "2026-07-03", categoryId: "c1" },
      { amountCents: 10_000, transactionDate: "2026-07-09", categoryId: "c1" },
      { amountCents: 60_000, transactionDate: "2026-07-25", categoryId: "c1" },
      // Agosto, até ao dia 10: os mesmos 200 €.
      { amountCents: 10_000, transactionDate: "2026-08-04", categoryId: "c1" },
      { amountCents: 10_000, transactionDate: "2026-08-10", categoryId: "c1" },
    ];

    const r = buildMonthComparison(despesas, cats, 3, "previous", 10);

    expect(r.partial).toBe(true);
    expect(r.throughDay).toBe(10);
    expect(r.currentTotalCents).toBe(20_000);
    // Julho até ao dia 10, e não julho inteiro.
    expect(r.baselineTotalCents).toBe(20_000);
    expect(r.baselineDeltaCents).toBe(0);
    expect(r.baselineDeltaPct).toBe(0);
    // A categoria segue a mesma regra: senão a linha contradiz o total.
    expect(r.categories[0]!.previousCents).toBe(20_000);
  });

  it("um mês fechado continua a comparar-se com o mês inteiro", () => {
    const despesas = [
      { amountCents: 10_000, transactionDate: "2026-07-03", categoryId: "c1" },
      { amountCents: 60_000, transactionDate: "2026-07-25", categoryId: "c1" },
      { amountCents: 10_000, transactionDate: "2026-08-04", categoryId: "c1" },
    ];
    // Sem dia de corte: agosto já acabou (ou não é o mês corrente).
    const r = buildMonthComparison(despesas, cats, 3, "previous");

    expect(r.partial).toBe(false);
    expect(r.baselineTotalCents).toBe(70_000);
  });


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

describe("buildMonthComparison, modos de comparação", () => {
  // Três meses de dados: mai/25 (homólogo de mai/26), mar/26, abr/26, mai/26.
  const cats = [{ id: "casa", name: "Casa", color: "#111" }];
  const expenses = [
    { amountCents: 10000, transactionDate: "2025-05-10", categoryId: "casa" },
    { amountCents: 20000, transactionDate: "2026-03-10", categoryId: "casa" },
    { amountCents: 40000, transactionDate: "2026-04-10", categoryId: "casa" },
    { amountCents: 30000, transactionDate: "2026-05-10", categoryId: "casa" },
  ];

  it("por omissão compara com o mês anterior", () => {
    const c = buildMonthComparison(expenses, cats);
    expect(c.currentMonth).toBe("2026-05");
    expect(c.baseline).toBe("previous");
    expect(c.baselineTotalCents).toBe(40000); // abril
    expect(c.baselineDeltaCents).toBe(-10000);
  });

  it("compara com a média dos meses anteriores, excluindo o próprio", () => {
    const c = buildMonthComparison(expenses, cats, 3, "average");
    // Anteriores a mai/26 com dados: mai/25, mar/26, abr/26 -> (100+200+400)/3
    expect(c.baselineTotalCents).toBe(Math.round((10000 + 20000 + 40000) / 3));
    expect(c.baselineLabel).toContain("média");
  });

  it("compara com o mês homólogo do ano anterior", () => {
    const c = buildMonthComparison(expenses, cats, 3, "yoy");
    expect(c.sameMonthLastYear).toBe("2025-05");
    expect(c.baselineTotalCents).toBe(10000);
    expect(c.baselineDeltaCents).toBe(20000);
    expect(c.baselineDeltaPct).toBe(200);
  });

  it("sem homólogo, a referência é zero e fica assinalado", () => {
    const soRecente = [{ amountCents: 5000, transactionDate: "2026-05-10", categoryId: "casa" }];
    const c = buildMonthComparison(soRecente, cats, 3, "yoy");
    expect(c.sameMonthLastYear).toBeNull();
    expect(c.baselineTotalCents).toBe(0);
    expect(c.baselineDeltaPct).toBeNull();
  });

  it("as categorias comparam contra a referência escolhida", () => {
    const c = buildMonthComparison(expenses, cats, 3, "yoy");
    const casa = c.categories.find((r) => r.key === "casa")!;
    expect(casa.currentCents).toBe(30000);
    expect(casa.previousCents).toBe(10000); // mai/25, não abril
  });

  it("devolve a série mensal ordenada para o gráfico", () => {
    const c = buildMonthComparison(expenses, cats);
    expect(c.series.map((p) => p.ym)).toEqual(["2025-05", "2026-03", "2026-04", "2026-05"]);
    expect(c.series.at(-1)!.totalCents).toBe(30000);
  });
});
