import { describe, expect, it } from "vitest";
import { buildAverages, daysInMonth, goalState, type MonthlyAmount } from "./averages";

const superm = (date: string, cents: number): MonthlyAmount => ({
  key: "cat_super",
  label: "Supermercado",
  color: "#3377f6",
  date,
  amountCents: cents,
});
const restaurantes = (date: string, cents: number): MonthlyAmount => ({
  key: "cat_rest",
  label: "Restaurantes",
  date,
  amountCents: cents,
});

describe("daysInMonth", () => {
  it("conhece os meses curtos e os anos bissextos", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2024-02")).toBe(29);
    expect(daysInMonth("2026-04")).toBe(30);
    expect(daysInMonth("2026-12")).toBe(31);
  });
});

describe("buildAverages", () => {
  const data = [
    superm("2026-05-10", 30000),
    superm("2026-06-10", 40000),
    superm("2026-07-10", 50000),
    superm("2026-08-03", 20000),
    restaurantes("2026-07-20", 10000),
    restaurantes("2026-08-04", 12000),
  ];

  it("compara o mês atual com a média dos meses anteriores", () => {
    const r = buildAverages(data, { windowMonths: 3 });
    expect(r.currentMonth).toBe("2026-08");
    expect(r.monthsCounted).toBe(3);

    const s = r.rows.find((x) => x.key === "cat_super")!;
    expect(s.currentCents).toBe(20000);
    expect(s.averageCents).toBe(40000); // (300+400+500)/3
    expect(s.deltaCents).toBe(-20000);
    expect(Math.round(s.deltaPct!)).toBe(-50);
  });

  it("nunca inclui o mês em análise na própria média", () => {
    const r = buildAverages([superm("2026-07-01", 50000), superm("2026-08-01", 20000)], {
      windowMonths: 6,
    });
    expect(r.rows.find((x) => x.key === "cat_super")!.averageCents).toBe(50000);
  });

  it("divide pelos meses da janela, não pelos meses da categoria", () => {
    // Restaurantes só aparece num dos três meses anteriores: a média mensal é
    // 100/3, não 100. Senão uma compra esporádica parecia um hábito.
    const r = buildAverages([...data, restaurantes("2026-06-15", 30000)], { windowMonths: 3 });
    const rest = r.rows.find((x) => x.key === "cat_rest")!;
    expect(rest.averageCents).toBe(Math.round((30000 + 10000) / 3));
  });

  it("respeita o mês pedido em vez do mais recente", () => {
    const r = buildAverages(data, { currentMonth: "2026-07", windowMonths: 2 });
    const s = r.rows.find((x) => x.key === "cat_super")!;
    expect(s.currentCents).toBe(50000);
    expect(s.averageCents).toBe(35000); // (300+400)/2
  });

  it("devolve vazio sem dados", () => {
    const r = buildAverages([]);
    expect(r.currentMonth).toBeNull();
    expect(r.rows).toEqual([]);
    expect(r.total).toBeNull();
  });

  it("dá o total do ambiente com a mesma leitura", () => {
    const r = buildAverages(data, { windowMonths: 3 });
    expect(r.total!.currentCents).toBe(32000);
    expect(r.total!.averageCents).toBe(Math.round((30000 + 40000 + 60000) / 3));
  });

  it("sem meses anteriores, a média é zero e não rebenta", () => {
    const r = buildAverages([superm("2026-08-01", 20000)]);
    const s = r.rows.find((x) => x.key === "cat_super")!;
    expect(s.averageCents).toBe(0);
    expect(s.monthsCounted).toBe(0);
    expect(s.deltaPct).toBeNull();
  });
});

describe("mês a meio (throughDay)", () => {
  const data = [
    // Ano passado: gastou cedo no mês.
    restaurantes("2025-08-02", 50000),
    restaurantes("2025-08-25", 30000),
    // Este ano: só 5 € até dia 5.
    restaurantes("2026-08-05", 500),
    restaurantes("2026-08-28", 90000), // ainda não aconteceu a 5/8
    restaurantes("2026-07-10", 20000),
  ];

  it("corta o mês em análise no dia indicado", () => {
    const r = buildAverages(data, { currentMonth: "2026-08", throughDay: 5 });
    const rest = r.rows.find((x) => x.key === "cat_rest")!;
    expect(rest.currentCents).toBe(500);
    expect(r.partial).toBe(true);
    expect(r.throughDay).toBe(5);
  });

  it("compara com o homólogo até ao MESMO dia", () => {
    // É o caso do utilizador: 5 € a 5/8/2026 contra 500 € a 5/8/2025.
    const r = buildAverages(data, { currentMonth: "2026-08", throughDay: 5 });
    const rest = r.rows.find((x) => x.key === "cat_rest")!;
    expect(r.yoyMonth).toBe("2025-08");
    expect(rest.yoyToDayCents).toBe(50000); // só a compra de 2/8
    expect(rest.yoyCents).toBe(80000); // o mês homólogo completo
    expect(rest.yoyDeltaCents).toBe(500 - 50000);
    expect(Math.round(rest.yoyDeltaPct!)).toBe(-99);
  });

  it("dá também a média só até ao mesmo dia", () => {
    const r = buildAverages(data, { currentMonth: "2026-08", throughDay: 5, windowMonths: 12 });
    const rest = r.rows.find((x) => x.key === "cat_rest")!;
    // Meses anteriores com dados: 2025-08 e 2026-07 (2 meses).
    // Até ao dia 5: só a compra de 2/8/2025.
    expect(rest.monthsCounted).toBe(2);
    expect(rest.averageToDayCents).toBe(Math.round(50000 / 2));
    expect(rest.averageCents).toBe(Math.round((80000 + 20000) / 2));
  });

  it("sem homólogo nos dados, os campos ficam nulos", () => {
    const r = buildAverages([superm("2026-08-01", 1000)], { throughDay: 5 });
    const s = r.rows.find((x) => x.key === "cat_super")!;
    expect(s.yoyCents).toBeNull();
    expect(s.yoyToDayCents).toBeNull();
    expect(s.yoyDeltaCents).toBeNull();
  });

  it("mês completo não é parcial e não corta nada", () => {
    const r = buildAverages(data, { currentMonth: "2026-08" });
    const rest = r.rows.find((x) => x.key === "cat_rest")!;
    expect(r.partial).toBe(false);
    expect(r.throughDay).toBe(31);
    expect(rest.currentCents).toBe(90500);
  });

  it("limita o dia ao tamanho do mês", () => {
    const r = buildAverages([superm("2026-02-10", 1000)], { currentMonth: "2026-02", throughDay: 99 });
    expect(r.throughDay).toBe(28);
    expect(r.partial).toBe(false);
  });
});

describe("metas", () => {
  it("classifica abaixo, perto e acima da meta", () => {
    expect(goalState(10000, 50000)).toBe("under");
    expect(goalState(40000, 50000)).toBe("near"); // 80%
    expect(goalState(50001, 50000)).toBe("over");
    expect(goalState(10000, null)).toBe("none");
    expect(goalState(10000, 0)).toBe("none");
  });

  it("calcula percentagem e quanto falta", () => {
    const r = buildAverages([superm("2026-08-01", 30000)], { goals: { cat_super: 40000 } });
    const s = r.rows.find((x) => x.key === "cat_super")!;
    expect(Math.round(s.goalPct!)).toBe(75);
    expect(s.goalRemainingCents).toBe(10000);
    expect(s.goalState).toBe("under");
  });

  it("mostra categorias com meta mesmo sem despesa este mês", () => {
    const r = buildAverages([superm("2026-08-01", 30000)], { goals: { cat_rest: 20000 } });
    const rest = r.rows.find((x) => x.key === "cat_rest")!;
    expect(rest.currentCents).toBe(0);
    expect(rest.goalRemainingCents).toBe(20000);
  });

  it("põe à cabeça o que passou a meta", () => {
    const r = buildAverages([superm("2026-08-01", 10000), restaurantes("2026-08-01", 60000)], {
      goals: { cat_rest: 20000 },
    });
    expect(r.rows[0]!.key).toBe("cat_rest");
  });

  it("a meta do total não entra nas linhas por categoria", () => {
    const r = buildAverages([superm("2026-08-01", 10000)], { goals: { __total__: 100000 } });
    expect(r.rows.map((x) => x.key)).toEqual(["cat_super"]);
    expect(r.total!.goalCents).toBe(100000);
  });
});
