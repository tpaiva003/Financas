import { describe, expect, it } from "vitest";

import {
  buildNetWorthSeries,
  juntarHistorico,
  normalizeSnapshots,
  porMes,
  precoEm,
  reconstruirHistorico,
  rotuloDoMes,
  saldoHaMeses,
  unidadesEm,
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

describe("unidadesEm", () => {
  const movimentos = [
    { date: "2025-01-10", unidades: 10 },
    { date: "2025-06-15", unidades: 5 },
    { date: "2026-02-01", unidades: -3 },
  ];

  it("conta só o que já aconteceu até àquela data", () => {
    expect(unidadesEm(movimentos, "2024-12-31")).toBe(0);
    expect(unidadesEm(movimentos, "2025-01-31")).toBe(10);
    expect(unidadesEm(movimentos, "2025-12-31")).toBe(15);
    expect(unidadesEm(movimentos, "2026-03-31")).toBe(12);
  });

  it("nunca devolve uma posição negativa", () => {
    expect(unidadesEm([{ date: "2025-01-01", unidades: -5 }], "2026-01-01")).toBe(0);
  });
});

describe("precoEm", () => {
  const precos = [
    { date: "2025-01-31", closeEurCents: 100_00 },
    { date: "2025-06-30", closeEurCents: 120_00 },
  ];

  it("usa o último fecho conhecido até à data", () => {
    expect(precoEm(precos, "2025-03-15")).toBe(100_00);
    expect(precoEm(precos, "2026-01-01")).toBe(120_00);
  });

  it("devolve null antes de haver cotação nenhuma", () => {
    expect(precoEm(precos, "2024-12-31")).toBeNull();
  });
});

describe("saldoHaMeses", () => {
  const credito = { balanceCents: 150_000_00, annualRatePct: 3.6, monthlyPaymentCents: 800_00 };

  it("um crédito era maior no passado", () => {
    expect(saldoHaMeses(credito, 12)).toBeGreaterThan(credito.balanceCents);
  });

  it("recuar e avançar dá o mesmo sítio", () => {
    const i = 3.6 / 100 / 12;
    let saldo = saldoHaMeses(credito, 6);
    for (let k = 0; k < 6; k++) saldo = saldo * (1 + i) - 800_00;
    expect(Math.abs(saldo - credito.balanceCents)).toBeLessThan(100);
  });

  /**
   * Uma prestação que não cobre os juros faz o saldo passado explodir para
   * números absurdos. Mais vale ficar no de hoje do que desenhar um crédito de
   * mil milhões.
   */
  it("desiste em vez de desenhar um número absurdo", () => {
    const mau = { balanceCents: 150_000_00, annualRatePct: 0.001, monthlyPaymentCents: 100_000_000_00 };
    expect(saldoHaMeses(mau, 120)).toBe(150_000_00);
  });

  it("com zero meses é o saldo de hoje", () => {
    expect(saldoHaMeses(credito, 0)).toBe(credito.balanceCents);
  });
});

describe("reconstruirHistorico", () => {
  const base = {
    hoje: "2026-08-10",
    meses: 6,
    investimentos: [
      {
        movimentos: [{ date: "2026-03-01", unidades: 10 }],
        precos: [
          { date: "2026-03-31", closeEurCents: 100_00 },
          { date: "2026-06-30", closeEurCents: 150_00 },
        ],
        custoUnitarioCents: 100_00,
      },
    ],
    dividas: [],
    outrosAtivosCents: 50_000_00,
    outrasDividasCents: 0,
  };

  it("marca tudo o que reconstrói como estimado", () => {
    const p = reconstruirHistorico(base);

    expect(p.length).toBeGreaterThan(0);
    expect(p.every((x) => x.estimado === true)).toBe(true);
  });

  it("não recua para antes do primeiro movimento", () => {
    const p = reconstruirHistorico(base);

    // O primeiro movimento é de março de 2026.
    expect(p[0]!.onDate >= "2026-03-01").toBe(true);
  });

  it("segue o preço da altura, não o de hoje", () => {
    const p = reconstruirHistorico(base);
    const marco = p.find((x) => x.onDate.startsWith("2026-03"));
    const julho = p.find((x) => x.onDate.startsWith("2026-07"));

    // 10 unidades a 100 € em março, a 150 € em julho, mais 50 mil de contas.
    expect(marco!.assetsCents).toBe(51_000_00);
    expect(julho!.assetsCents).toBe(51_500_00);
  });

  it("os pontos saem do mais antigo para o mais recente", () => {
    const p = reconstruirHistorico({ ...base, meses: 5 });

    for (let i = 1; i < p.length; i++) {
      expect(p[i]!.onDate > p[i - 1]!.onDate).toBe(true);
    }
  });

  /**
   * Sem cotação e sem custo não se inventa preço: a posição fica de fora. Um
   * preço assumido entra no património e desloca o número que a app existe
   * para mostrar.
   */
  it("deixa de fora a posição sem preço nem custo", () => {
    const p = reconstruirHistorico({
      ...base,
      investimentos: [
        { movimentos: [{ date: "2026-03-01", unidades: 10 }], precos: [], custoUnitarioCents: null },
      ],
    });

    expect(p.every((x) => x.assetsCents === 50_000_00)).toBe(true);
  });

  it("a dívida reconstruída é maior quanto mais para trás", () => {
    const p = reconstruirHistorico({
      ...base,
      dividas: [{ balanceCents: 150_000_00, annualRatePct: 3.6, monthlyPaymentCents: 800_00 }],
    });

    expect(p[0]!.debtsCents).toBeGreaterThan(p.at(-1)!.debtsCents);
  });

  /**
   * Sem nada reconstruível, todos os pontos seriam o valor de hoje repetido
   * para trás — uma linha horizontal a afirmar que o património esteve parado.
   * É a versão mais convincente da mentira que isto já assume ter.
   */
  it("não desenha uma linha reta com o valor de hoje repetido para trás", () => {
    expect(reconstruirHistorico({ ...base, investimentos: [] })).toEqual([]);
    expect(
      reconstruirHistorico({
        ...base,
        investimentos: [{ movimentos: [], precos: [], custoUnitarioCents: 100_00 }],
      }),
    ).toEqual([]);
  });
});

describe("juntarHistorico", () => {
  const estimado = [
    { onDate: "2026-06-30", assetsCents: 100, debtsCents: 0, netCents: 100, estimado: true },
    { onDate: "2026-07-31", assetsCents: 200, debtsCents: 0, netCents: 200, estimado: true },
  ];
  const medido = [{ onDate: "2026-07-15", assetsCents: 999, debtsCents: 0, netCents: 999 }];

  /**
   * O medido ganha sempre. Deixar um facto perder para um cálculo é trocar a
   * única coisa em que se pode confiar por uma estimativa.
   */
  it("o mês que tem fotografia a sério não leva estimativa", () => {
    const j = juntarHistorico(estimado, medido);

    expect(j.map((s) => s.onDate)).toEqual(["2026-06-30", "2026-07-15"]);
    expect(j.find((s) => s.onDate === "2026-07-15")!.netCents).toBe(999);
  });

  it("fica tudo por ordem de data", () => {
    const j = juntarHistorico(estimado, medido);

    for (let i = 1; i < j.length; i++) expect(j[i]!.onDate > j[i - 1]!.onDate).toBe(true);
  });
});
