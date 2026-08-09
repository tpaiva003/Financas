import { describe, expect, it } from "vitest";

import {
  buildNetWorthSeries,
  normalizeSnapshots,
  porMes,
  rotuloDoMes,
  type NetWorthSnapshot,
} from "./networth-history";

function foto(onDate: string, assets: number, debts: number): NetWorthSnapshot {
  return { onDate, assetsCents: assets, debtsCents: debts, netCents: assets - debts };
}

describe("rotuloDoMes", () => {
  it("escreve o mês por extenso e o ano com dois dígitos", () => {
    expect(rotuloDoMes("2026-08-09")).toBe("ago/26");
    expect(rotuloDoMes("2025-01-31")).toBe("jan/25");
  });
});

describe("normalizeSnapshots", () => {
  it("ordena por data e deita fora o que não tem forma de fotografia", () => {
    const s = normalizeSnapshots([
      { onDate: "2026-03-31", assetsCents: 300, debtsCents: 100 },
      { onDate: "2026-01-31", assetsCents: 100, debtsCents: 50 },
      { onDate: "não é data", assetsCents: 1, debtsCents: 0 },
      { onDate: "2026-02-28", assetsCents: null, debtsCents: 0 },
      null,
      "nada",
    ]);

    expect(s.map((x) => x.onDate)).toEqual(["2026-01-31", "2026-03-31"]);
  });

  /**
   * O líquido é derivado. Guardá-lo na tabela é conveniente — acreditar nele
   * não: uma linha escrita por uma versão antiga podia trazer a soma errada, e
   * o gráfico desenhava um degrau que nunca existiu.
   */
  it("recalcula o líquido em vez de acreditar no que está gravado", () => {
    const s = normalizeSnapshots([
      { onDate: "2026-01-31", assetsCents: 1000, debtsCents: 400, netCents: 999_999 },
    ]);

    expect(s[0]?.netCents).toBe(600);
  });

  it("fica com uma fotografia por dia", () => {
    const s = normalizeSnapshots([
      { onDate: "2026-01-31", assetsCents: 100, debtsCents: 0 },
      { onDate: "2026-01-31", assetsCents: 200, debtsCents: 0 },
    ]);

    expect(s).toHaveLength(1);
    expect(s[0]?.assetsCents).toBe(200);
  });
});

describe("porMes", () => {
  it("fica com a última fotografia de cada mês", () => {
    const m = porMes([
      foto("2026-01-05", 100, 0),
      foto("2026-01-31", 150, 0),
      foto("2026-02-28", 200, 0),
    ]);

    expect(m.map((x) => x.onDate)).toEqual(["2026-01-31", "2026-02-28"]);
  });
});

describe("buildNetWorthSeries", () => {
  it("dá a variação face ao mês anterior em cada ponto", () => {
    const s = buildNetWorthSeries([
      foto("2026-01-31", 100_000_00, 40_000_00),
      foto("2026-02-28", 110_000_00, 39_000_00),
    ]);

    expect(s.points[0]?.changeCents).toBeNull();
    expect(s.points[1]?.changeCents).toBe(11_000_00);
    expect(s.changeCents).toBe(11_000_00);
  });

  it("dá a percentagem quando se parte de um património positivo", () => {
    const s = buildNetWorthSeries([foto("2026-01-31", 100_000_00, 0), foto("2026-06-30", 120_000_00, 0)]);

    expect(s.changePct).toBeCloseTo(20, 5);
    expect(s.days).toBe(150);
  });

  /**
   * O caso que justifica o campo poder ser nulo. Ir de -50 mil para -10 mil é
   * uma melhoria de 40 mil, e a divisão dá -80% — o sinal ao contrário do que
   * aconteceu. Quem começa com mais dívida do que bens vê euros, e mais nada.
   */
  it("não dá percentagem a partir de um património negativo", () => {
    const s = buildNetWorthSeries([
      foto("2026-01-31", 10_000_00, 60_000_00),
      foto("2026-06-30", 30_000_00, 40_000_00),
    ]);

    expect(s.changeCents).toBe(40_000_00);
    expect(s.changePct).toBeNull();
  });

  it("nem a partir de zero", () => {
    const s = buildNetWorthSeries([foto("2026-01-31", 0, 0), foto("2026-06-30", 5_000_00, 0)]);

    expect(s.changePct).toBeNull();
  });

  it("com um ponto só não inventa variação nenhuma", () => {
    const s = buildNetWorthSeries([foto("2026-01-31", 100_000_00, 0)]);

    expect(s.points).toHaveLength(1);
    expect(s.changeCents).toBeNull();
    expect(s.changePct).toBeNull();
    expect(s.days).toBe(0);
  });

  it("sem fotografias devolve uma série vazia, não uma linha a zero", () => {
    const s = buildNetWorthSeries([]);

    expect(s.points).toEqual([]);
    expect(s.changeCents).toBeNull();
  });

  /**
   * Não se interpola. Se faltarem meses no meio — a app esteve sem correr, o
   * cron falhou — o gráfico mostra os pontos que existem. Uma linha desenhada
   * entre dois pontos distantes é uma afirmação sobre meses de que não se sabe
   * nada.
   */
  it("não enche os meses que faltam", () => {
    const s = buildNetWorthSeries([foto("2026-01-31", 100_000_00, 0), foto("2026-09-30", 130_000_00, 0)]);

    expect(s.points).toHaveLength(2);
    expect(s.points.map((p) => p.label)).toEqual(["jan/26", "set/26"]);
  });

  it("por dia mantém todos os pontos do mesmo mês", () => {
    const s = buildNetWorthSeries(
      [foto("2026-01-05", 100_00, 0), foto("2026-01-31", 150_00, 0)],
      "dia",
    );

    expect(s.points).toHaveLength(2);
  });
});
