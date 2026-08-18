import { describe, expect, it } from "vitest";

import { JANELAS, desempenhoNaJanela, inicioDaJanela, janelaPorId, type Janela } from "./janelas";

const dias = (n: number): Janela => ({ id: `${n}d`, label: `${n} dias`, dias: n, meses: null });
const meses = (n: number): Janela => ({ id: `${n}m`, label: `${n} meses`, dias: null, meses: n });

/** Carteira que só sabe os dias que lhe deram. O resto é `null`, como na app. */
const carteiraDe = (valores: Record<string, number>) => (dia: string) => valores[dia] ?? null;

describe("inicioDaJanela", () => {
  it("recua os dias de calendário pedidos", () => {
    expect(inicioDaJanela("2026-08-17", dias(1))).toBe("2026-08-16");
    expect(inicioDaJanela("2026-08-17", dias(7))).toBe("2026-08-10");
    expect(inicioDaJanela("2026-08-17", dias(15))).toBe("2026-08-02");
  });

  it("atravessa a fronteira do mês e do ano sem se perder", () => {
    expect(inicioDaJanela("2026-03-05", dias(7))).toBe("2026-02-26");
    expect(inicioDaJanela("2026-01-03", dias(7))).toBe("2025-12-27");
  });

  it("um mês antes do fim de um mês comprido é o fim do mês curto", () => {
    // O `setUTCMonth` do JavaScript devolveria 2026-03-03 aqui: fevereiro não
    // tem 31 dias e o excedente transborda para o mês seguinte. Uma janela de
    // "1 mês" que começasse a 3 de março mediria 28 dias e diria um mês.
    expect(inicioDaJanela("2026-03-31", meses(1))).toBe("2026-02-28");
    expect(inicioDaJanela("2026-05-31", meses(3))).toBe("2026-02-28");
    // Ano bissexto: 2028 tem 29 de fevereiro e a data existe mesmo.
    expect(inicioDaJanela("2028-03-31", meses(1))).toBe("2028-02-29");
  });

  it("um ano antes é o mesmo dia do ano anterior", () => {
    expect(inicioDaJanela("2026-08-17", meses(12))).toBe("2025-08-17");
    // O 29 de fevereiro de um bissexto encolhe para 28 no ano seguinte.
    expect(inicioDaJanela("2028-02-29", meses(12))).toBe("2027-02-28");
  });

  it("a lista tem as sete janelas pedidas, da mais curta para a mais longa", () => {
    expect(JANELAS.map((j) => j.id)).toEqual(["1d", "7d", "15d", "1m", "3m", "6m", "1a"]);
    expect(janelaPorId("6m")?.meses).toBe(6);
    expect(janelaPorId("nao-existe")).toBeNull();
  });
});

describe("desempenhoNaJanela", () => {
  it("um reforço a meio da janela não conta como rentabilidade", () => {
    /**
     * O caso que faz esta função existir.
     *
     * Carteira de 10 000 € que sobe 10% em duas semanas (11 000 €), recebe
     * 10 000 € de reforço nesse dia (21 000 €) e sobe outros 10% até ao fim
     * (23 100 €).
     *
     * A resposta certa é 21% (1,10 × 1,10). A conta ingénua — valor final
     * sobre valor inicial — daria 131%, porque conta o reforço como lucro. E
     * pôr o reforço na base do troço anterior, como se lá estivesse desde o
     * primeiro dia, daria 15,5%.
     */
    const r = desempenhoNaJanela({
      janela: dias(30),
      ate: "2026-01-31",
      primeiroDia: "2025-06-01",
      carteiraEm: carteiraDe({
        "2026-01-01": 1_000_000,
        "2026-01-15": 2_100_000,
        "2026-01-31": 2_310_000,
      }),
      precosDoIndice: { "2026-01-01": 100, "2026-01-31": 110 },
      fluxos: [{ date: "2026-01-15", amountCents: 1_000_000 }],
    });

    expect(r.motivo).toBeNull();
    expect(r.carteiraPct).toBeCloseTo(21, 6);
    expect(r.indicePct).toBeCloseTo(10, 6);
    expect(r.diferencaPct).toBeCloseTo(11, 6);
    expect(r.fluxoNoPeriodoCents).toBe(1_000_000);
    expect(r.carteiraInicioCents).toBe(1_000_000);
    expect(r.carteiraFimCents).toBe(2_310_000);
  });

  it("sem movimentos é a subida da carteira, e o índice o que subiu no mesmo período", () => {
    const r = desempenhoNaJanela({
      janela: dias(7),
      ate: "2026-01-08",
      primeiroDia: "2025-01-01",
      carteiraEm: carteiraDe({ "2026-01-01": 1_000_000, "2026-01-08": 1_050_000 }),
      precosDoIndice: { "2026-01-01": 200, "2026-01-08": 190 },
      fluxos: [],
    });

    expect(r.carteiraPct).toBeCloseTo(5, 6);
    expect(r.indicePct).toBeCloseTo(-5, 6);
    // Cinco por cento acima de um índice que caiu cinco são dez pontos.
    expect(r.diferencaPct).toBeCloseTo(10, 6);
  });

  it("dois reforços no mesmo dia somam em vez de um deles se perder", () => {
    const r = desempenhoNaJanela({
      janela: dias(30),
      ate: "2026-01-31",
      primeiroDia: "2025-06-01",
      carteiraEm: carteiraDe({
        "2026-01-01": 1_000_000,
        "2026-01-15": 2_100_000,
        "2026-01-31": 2_310_000,
      }),
      precosDoIndice: { "2026-01-01": 100, "2026-01-31": 110 },
      fluxos: [
        { date: "2026-01-15", amountCents: 400_000 },
        { date: "2026-01-15", amountCents: 600_000 },
      ],
    });

    expect(r.fluxoNoPeriodoCents).toBe(1_000_000);
    // O mesmo 21% do primeiro teste: os dois reforços do dia valem um só.
    expect(r.carteiraPct).toBeCloseTo(21, 6);
  });

  it("um movimento no último dia não inventa rentabilidade nenhuma", () => {
    const r = desempenhoNaJanela({
      janela: dias(7),
      ate: "2026-01-08",
      primeiroDia: "2025-01-01",
      carteiraEm: carteiraDe({ "2026-01-01": 1_000_000, "2026-01-08": 2_100_000 }),
      precosDoIndice: { "2026-01-01": 100, "2026-01-08": 100 },
      // Um milhão entrou hoje: a carteira valia 1 100 000 antes dele.
      fluxos: [{ date: "2026-01-08", amountCents: 1_000_000 }],
    });

    expect(r.carteiraPct).toBeCloseTo(10, 6);
    expect(r.carteiraFimCents).toBe(2_100_000);
  });

  it("uma janela mais velha do que a carteira recusa-se em vez de medir menos tempo", () => {
    const r = desempenhoNaJanela({
      janela: meses(12),
      ate: "2026-08-17",
      primeiroDia: "2026-05-01",
      carteiraEm: carteiraDe({ "2025-08-17": 1_000_000, "2026-08-17": 1_400_000 }),
      precosDoIndice: { "2025-08-17": 100, "2026-08-17": 110 },
      fluxos: [],
    });

    expect(r.carteiraPct).toBeNull();
    expect(r.indicePct).toBeNull();
    expect(r.motivo).toBe("A carteira só existe desde 2026-05-01.");
  });

  it("um dia de movimento sem cotação recusa a janela inteira", () => {
    const r = desempenhoNaJanela({
      janela: dias(30),
      ate: "2026-01-31",
      primeiroDia: "2025-06-01",
      // Falta o 15, que é dia de movimento: o troço que ele fecha mediria
      // outra coisa e o número sairia com ar de resposta.
      carteiraEm: carteiraDe({ "2026-01-01": 1_000_000, "2026-01-31": 2_310_000 }),
      precosDoIndice: { "2026-01-01": 100, "2026-01-31": 110 },
      fluxos: [{ date: "2026-01-15", amountCents: 1_000_000 }],
    });

    expect(r.carteiraPct).toBeNull();
    expect(r.motivo).toContain("2026-01-15");
  });

  it("sem valor da carteira numa das pontas não há janela", () => {
    const semInicio = desempenhoNaJanela({
      janela: dias(7),
      ate: "2026-01-08",
      primeiroDia: "2025-01-01",
      carteiraEm: carteiraDe({ "2026-01-08": 1_000_000 }),
      precosDoIndice: { "2026-01-01": 100, "2026-01-08": 110 },
      fluxos: [],
    });
    expect(semInicio.motivo).toContain("2026-01-01");

    const semFim = desempenhoNaJanela({
      janela: dias(7),
      ate: "2026-01-08",
      primeiroDia: "2025-01-01",
      carteiraEm: carteiraDe({ "2026-01-01": 1_000_000 }),
      precosDoIndice: { "2026-01-01": 100, "2026-01-08": 110 },
      fluxos: [],
    });
    expect(semFim.motivo).toContain("2026-01-08");
  });

  it("o índice num dia sem sessão usa o último fecho que existiu mesmo", () => {
    // 2026-01-04 é domingo; 2026-01-11 também. Os dois lados recuam para
    // sexta-feira em vez de a janela desaparecer.
    const r = desempenhoNaJanela({
      janela: dias(7),
      ate: "2026-01-11",
      primeiroDia: "2025-01-01",
      carteiraEm: carteiraDe({ "2026-01-04": 1_000_000, "2026-01-11": 1_000_000 }),
      precosDoIndice: { "2026-01-02": 100, "2026-01-09": 105 },
      fluxos: [],
    });

    expect(r.de).toBe("2026-01-04");
    expect(r.indicePct).toBeCloseTo(5, 6);
    expect(r.carteiraPct).toBeCloseTo(0, 6);
  });

  it("as duas pontas no mesmo fecho não dão 0%, dão nada", () => {
    /**
     * Segunda-feira, com o último fecho na sexta. As duas pontas da janela de
     * um dia recuam para a mesma sexta-feira e a conta dava +0,0% dos dois
     * lados — que se lê como "esteve parado" quando o que se passa é que ainda
     * não há dia nenhum para comparar. Acontece todas as segundas.
     */
    const r = desempenhoNaJanela({
      janela: dias(1),
      ate: "2026-08-17",
      primeiroDia: "2025-01-01",
      carteiraEm: carteiraDe({ "2026-08-16": 1_000_000, "2026-08-17": 1_000_000 }),
      precosDoIndice: { "2026-08-14": 100 },
      fluxos: [],
    });

    expect(r.carteiraPct).toBeNull();
    expect(r.indicePct).toBeNull();
    expect(r.motivo).toContain("2026-08-14");
  });

  it("mas um dia com fecho próprio mede-se, mesmo por cima de um fim de semana", () => {
    // Segunda 2026-08-17 já com fecho, contra a sexta 2026-08-14.
    const r = desempenhoNaJanela({
      janela: dias(1),
      ate: "2026-08-17",
      primeiroDia: "2025-01-01",
      carteiraEm: carteiraDe({ "2026-08-16": 1_000_000, "2026-08-17": 1_020_000 }),
      precosDoIndice: { "2026-08-14": 100, "2026-08-17": 101 },
      fluxos: [],
    });

    expect(r.motivo).toBeNull();
    expect(r.carteiraPct).toBeCloseTo(2, 6);
    expect(r.indicePct).toBeCloseTo(1, 6);
  });

  it("um índice sem cotações no período não se estica para caber", () => {
    const r = desempenhoNaJanela({
      janela: dias(7),
      ate: "2026-01-08",
      primeiroDia: "2025-01-01",
      carteiraEm: carteiraDe({ "2026-01-01": 1_000_000, "2026-01-08": 1_100_000 }),
      // O fecho mais próximo do início está a mais de dez dias.
      precosDoIndice: { "2025-12-01": 100, "2026-01-08": 110 },
      fluxos: [],
    });

    expect(r.indicePct).toBeNull();
    expect(r.motivo).toBe("O índice não tem cotações para todo o período.");
  });

  it("os movimentos fora da janela não entram na conta", () => {
    const r = desempenhoNaJanela({
      janela: dias(7),
      ate: "2026-01-08",
      primeiroDia: "2025-01-01",
      carteiraEm: carteiraDe({ "2026-01-01": 1_000_000, "2026-01-08": 1_100_000 }),
      precosDoIndice: { "2026-01-01": 100, "2026-01-08": 100 },
      fluxos: [
        { date: "2025-12-20", amountCents: 5_000_000 },
        // O primeiro dia da janela já tem o dinheiro dentro do valor inicial.
        { date: "2026-01-01", amountCents: 5_000_000 },
        { date: "2026-02-01", amountCents: 5_000_000 },
      ],
    });

    expect(r.fluxoNoPeriodoCents).toBe(0);
    expect(r.carteiraPct).toBeCloseTo(10, 6);
  });
});
