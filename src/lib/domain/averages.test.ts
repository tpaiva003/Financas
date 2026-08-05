import { describe, expect, it } from "vitest";
import { buildAverages, goalState, type MonthlyAmount } from "./averages";

const superm = (ym: string, cents: number): MonthlyAmount => ({
  key: "cat_super",
  label: "Supermercado",
  color: "#3377f6",
  ym,
  amountCents: cents,
});
const restaurantes = (ym: string, cents: number): MonthlyAmount => ({
  key: "cat_rest",
  label: "Restaurantes",
  ym,
  amountCents: cents,
});

describe("buildAverages", () => {
  const data = [
    superm("2026-05", 30000),
    superm("2026-06", 40000),
    superm("2026-07", 50000),
    superm("2026-08", 20000),
    restaurantes("2026-07", 10000),
    restaurantes("2026-08", 12000),
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
    const r = buildAverages([superm("2026-07", 50000), superm("2026-08", 20000)], {
      windowMonths: 6,
    });
    expect(r.rows.find((x) => x.key === "cat_super")!.averageCents).toBe(50000);
  });

  it("divide pelos meses da janela, não pelos meses da categoria", () => {
    // Restaurantes só aparece num dos três meses anteriores: a média mensal é
    // 100/3, não 100. Senão uma compra esporádica parecia um hábito.
    const r = buildAverages(
      [...data, restaurantes("2026-06", 30000)],
      { windowMonths: 3 },
    );
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
    const r = buildAverages([superm("2026-08", 20000)]);
    const s = r.rows.find((x) => x.key === "cat_super")!;
    expect(s.averageCents).toBe(0);
    expect(s.monthsCounted).toBe(0);
    expect(s.deltaPct).toBeNull();
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
    const r = buildAverages([superm("2026-08", 30000)], { goals: { cat_super: 40000 } });
    const s = r.rows.find((x) => x.key === "cat_super")!;
    expect(Math.round(s.goalPct!)).toBe(75);
    expect(s.goalRemainingCents).toBe(10000);
    expect(s.goalState).toBe("under");
  });

  it("mostra categorias com meta mesmo sem despesa este mês", () => {
    const r = buildAverages([superm("2026-08", 30000)], { goals: { cat_rest: 20000 } });
    const rest = r.rows.find((x) => x.key === "cat_rest")!;
    expect(rest.currentCents).toBe(0);
    expect(rest.goalRemainingCents).toBe(20000);
  });

  it("põe à cabeça o que passou a meta", () => {
    const r = buildAverages(
      [superm("2026-08", 10000), restaurantes("2026-08", 60000)],
      { goals: { cat_rest: 20000 } },
    );
    expect(r.rows[0]!.key).toBe("cat_rest");
  });

  it("a meta do total não entra nas linhas por categoria", () => {
    const r = buildAverages([superm("2026-08", 10000)], { goals: { __total__: 100000 } });
    expect(r.rows.map((x) => x.key)).toEqual(["cat_super"]);
    expect(r.total!.goalCents).toBe(100000);
  });
});
