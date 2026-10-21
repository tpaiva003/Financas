import { describe, expect, it } from "vitest";
import {
  buildCreditoPlano,
  effectiveRatePct,
  monthsBetween,
  parseCreditTerms,
  tipoDoCredito,
  type RatePeriod,
} from "./credito";
import { annuityPaymentCents, buildLoan } from "./loan";

describe("monthsBetween", () => {
  it("conta meses inteiros", () => {
    expect(monthsBetween("2026-01-01", "2027-01-01")).toBe(12);
    expect(monthsBetween("2026-01-01", "2026-01-01")).toBe(0);
  });

  // De 15/01 a 10/02 ainda não passou um mês: se contasse, a prestação de um
  // crédito a acabar aparecia um mês mais cedo do que é.
  it("só conta o mês quando o dia já passou", () => {
    expect(monthsBetween("2026-01-15", "2026-02-10")).toBe(0);
    expect(monthsBetween("2026-01-15", "2026-02-15")).toBe(1);
  });

  it("é negativo quando a segunda data é antes", () => {
    expect(monthsBetween("2026-06-01", "2026-01-01")).toBe(-5);
  });
});

describe("effectiveRatePct", () => {
  it("numa fixa é a taxa escrita", () => {
    expect(effectiveRatePct({ startsOn: "2026-01-01", kind: "fixa", ratePct: 3.3 }, {})).toBe(3.3);
  });

  it("numa variável é o indexante mais o spread", () => {
    const p: RatePeriod = {
      startsOn: "2029-01-01",
      kind: "variavel",
      indexante: "euribor6m",
      spreadPct: 0.9,
    };
    expect(effectiveRatePct(p, { euribor6m: 2.1 })).toBeCloseTo(3.0, 10);
  });

  /**
   * O caso que justifica a função devolver `null` em vez de um número.
   *
   * Sem o valor do indexante, a alternativa cómoda era tratá-lo como zero — e
   * zero é uma taxa perfeitamente válida, que produziria um plano inteiro sem
   * juros nenhuns. Ninguém desconfia de uma prestação baixa.
   */
  it("sem o valor do indexante não inventa zero", () => {
    const p: RatePeriod = {
      startsOn: "2029-01-01",
      kind: "variavel",
      indexante: "euribor6m",
      spreadPct: 0.9,
    };
    expect(effectiveRatePct(p, {})).toBeNull();
    expect(effectiveRatePct(p, { euribor3m: 2.1 })).toBeNull();
  });

  // A Euribor esteve negativa anos a fio; com spread de 1% e indexante a -0,5%
  // a taxa é 0,5%, não -0,5%. Mas se a soma der negativa, o banco não paga a
  // ninguém: fica em zero.
  it("aceita indexante negativo e trava a soma em zero", () => {
    const p: RatePeriod = { startsOn: "2020-01-01", kind: "variavel", indexante: "euribor12m", spreadPct: 1 };
    expect(effectiveRatePct(p, { euribor12m: -0.5 })).toBeCloseTo(0.5, 10);
    expect(effectiveRatePct({ ...p, spreadPct: 0.1 }, { euribor12m: -0.5 })).toBe(0);
  });

  it("uma fixa sem taxa escrita não vale zero", () => {
    expect(effectiveRatePct({ startsOn: "2026-01-01", kind: "fixa" }, {})).toBeNull();
    expect(effectiveRatePct({ startsOn: "2026-01-01", kind: "fixa", ratePct: null }, {})).toBeNull();
  });
});

describe("tipoDoCredito", () => {
  it("é mista quando há dos dois", () => {
    expect(
      tipoDoCredito([
        { startsOn: "2026-01-01", kind: "fixa", ratePct: 3.3 },
        { startsOn: "2029-01-01", kind: "variavel", indexante: "euribor6m", spreadPct: 0.9 },
      ]),
    ).toBe("mista");
  });

  it("é fixa ou variável quando só há de um", () => {
    expect(tipoDoCredito([{ startsOn: "2026-01-01", kind: "fixa", ratePct: 3.3 }])).toBe("fixa");
    expect(
      tipoDoCredito([{ startsOn: "2026-01-01", kind: "variavel", indexante: "euribor3m" }]),
    ).toBe("variavel");
  });

  it("sem períodos não é nada", () => {
    expect(tipoDoCredito([])).toBeNull();
  });
});

describe("parseCreditTerms", () => {
  it("lê o que está bem escrito", () => {
    const t = parseCreditTerms({
      periods: [
        { startsOn: "2026-01-01", kind: "fixa", ratePct: 3.3 },
        { startsOn: "2029-01-01", kind: "variavel", indexante: "euribor6m", spreadPct: 0.9 },
      ],
      indexanteRates: { euribor6m: 2.1 },
    });
    expect(t!.periods).toHaveLength(2);
    expect(t!.periods[1]!.indexante).toBe("euribor6m");
    expect(t!.indexanteRates.euribor6m).toBe(2.1);
  });

  /**
   * A coluna é `jsonb`: o Postgres devolve o que lá estiver, escrito por esta
   * versão da app ou por outra qualquer. Deitar fora o que não se percebe é o
   * contrário de o deixar passar como se fosse bom — um período com a data
   * corrompida daria um plano de amortização com números a sério e origem
   * duvidosa, que é o pior tipo de resposta que esta app pode dar.
   */
  it("deita fora os períodos que não se percebem", () => {
    const t = parseCreditTerms({
      periods: [
        { startsOn: "2026-01-01", kind: "fixa", ratePct: 3.3 },
        { startsOn: "ontem", kind: "fixa", ratePct: 3 },
        { startsOn: "2030-01-01", kind: "flutuante" },
        { startsOn: "2031-01-01" },
        null,
        "2032-01-01",
      ],
    });
    expect(t!.periods).toHaveLength(1);
    expect(t!.periods[0]!.startsOn).toBe("2026-01-01");
  });

  it("não aceita um indexante que não conhece", () => {
    const t = parseCreditTerms({
      periods: [{ startsOn: "2026-01-01", kind: "variavel", indexante: "libor", spreadPct: 1 }],
      indexanteRates: { libor: 5, euribor3m: "2,1" },
    });
    expect(t!.periods[0]!.indexante).toBeNull();
    expect(t!.indexanteRates).toEqual({});
    // E sem indexante não há taxa: recusa em vez de inventar.
    expect(effectiveRatePct(t!.periods[0]!, t!.indexanteRates)).toBeNull();
  });

  it("sem nada que se aproveite, devolve null", () => {
    expect(parseCreditTerms(null)).toBeNull();
    expect(parseCreditTerms({})).toBeNull();
    expect(parseCreditTerms({ periods: [] })).toBeNull();
    expect(parseCreditTerms({ periods: "fixa" })).toBeNull();
    expect(parseCreditTerms("{}")).toBeNull();
  });
});

describe("buildCreditoPlano", () => {
  /** 150 000 € a 30 anos: 3 anos fixa a 3,3%, depois Euribor 6M + 0,9%. */
  const misto = {
    balanceCents: 150_000_00,
    startDate: "2026-01-01",
    maturityDate: "2056-01-01",
    periods: [
      { startsOn: "2026-01-01", kind: "fixa", ratePct: 3.3 },
      { startsOn: "2029-01-01", kind: "variavel", indexante: "euribor6m", spreadPct: 0.9 },
    ] as RatePeriod[],
    indexanteRates: { euribor6m: 2.1 },
  };

  it("parte o crédito nos períodos que tem", () => {
    const plano = buildCreditoPlano(misto);
    expect(plano.problem).toBeNull();
    expect(plano.tramos).toHaveLength(2);
    expect(plano.tramos[0]!.months).toBe(36);
    expect(plano.tramos[1]!.months).toBe(324);
    expect(plano.tramos[0]!.annualRatePct).toBe(3.3);
    expect(plano.tramos[1]!.annualRatePct).toBeCloseTo(3.0, 10);
  });

  /**
   * **O teste que justifica este ficheiro todo.**
   *
   * O `buildLoan` só conhece uma taxa, e por isso mostraria durante trinta anos
   * a prestação do período fixo. A prestação muda mesmo — e muda porque o banco
   * recalcula a anuidade sobre o capital que sobra e os meses que faltam **até à
   * maturidade**, não sobre o capital inicial nem sobre o prazo original.
   */
  it("recalcula a prestação em cada mudança de taxa, sobre o que falta", () => {
    const plano = buildCreditoPlano(misto);
    const [a, b] = plano.tramos as [(typeof plano.tramos)[number], (typeof plano.tramos)[number]];

    // A primeira é a anuidade normal sobre os 30 anos.
    expect(a.monthlyPaymentCents).toBe(annuityPaymentCents(150_000_00, 3.3, 360));

    // A segunda é a anuidade sobre o capital que sobrou e os 324 meses que
    // faltam — e é isso que o `buildLoan` sozinho não sabe fazer.
    expect(b.openingBalanceCents).toBe(a.closingBalanceCents);
    expect(b.monthlyPaymentCents).toBe(annuityPaymentCents(a.closingBalanceCents, 3.0, 324));

    // Desceu a taxa, desceu a prestação: há degrau, e o plano di-lo.
    expect(b.monthlyPaymentCents).toBeLessThan(a.monthlyPaymentCents);
    expect(plano.currentPaymentCents).toBe(a.monthlyPaymentCents);
    expect(plano.nextPaymentCents).toBe(b.monthlyPaymentCents);
    expect(plano.nextChangeOn).toBe("2029-01-01");
  });

  /**
   * Contra-prova: mostrar a prestação do período fixo até ao fim seria mentira.
   *
   * O `buildLoan` com a taxa fixa dá exatamente a prestação do primeiro troço, e
   * uns juros totais que não têm nada a ver com os do crédito real.
   */
  it("não é o que uma taxa só diria", () => {
    const plano = buildCreditoPlano(misto);
    const umaTaxaSo = buildLoan({ principalCents: 150_000_00, annualRatePct: 3.3, termMonths: 360 });

    expect(umaTaxaSo.monthlyPaymentCents).toBe(plano.tramos[0]!.monthlyPaymentCents);
    // Metade do crédito corre a 3% e não a 3,3%: os juros totais são bem outros.
    expect(plano.totalInterestCents).toBeLessThan(umaTaxaSo.totalInterestCents!);
    expect(umaTaxaSo.totalInterestCents! - plano.totalInterestCents).toBeGreaterThan(5_000_00);
  });

  it("a subida do indexante faz a prestação subir", () => {
    const barato = buildCreditoPlano(misto);
    const caro = buildCreditoPlano({ ...misto, indexanteRates: { euribor6m: 4.5 } });
    expect(caro.nextPaymentCents!).toBeGreaterThan(barato.nextPaymentCents!);
  });

  it("salda o crédito ao chegar à maturidade", () => {
    const plano = buildCreditoPlano(misto);
    const ultimo = plano.tramos[plano.tramos.length - 1]!;
    // Ao cêntimo: a última prestação é só o que falta, não a prestação inteira.
    expect(ultimo.closingBalanceCents).toBe(0);
  });

  /**
   * Um crédito só de taxa fixa tem de dar o mesmo que o cálculo simples — se
   * divergisse muito, era o novo código que estava errado, não o antigo.
   *
   * Não coincide ao cêntimo, e por uma razão que vale a pena escrever: a
   * prestação é a anuidade arredondada, e ao fim de 240 vezes sobra um resto de
   * poucos cêntimos. O `buildLoan` paga esse resto num mês **241** — um mês que
   * o contrato não tem. Aqui a última prestação absorve-o, que é o que o banco
   * faz. Daí um cêntimo de diferença nos juros totais, e o prazo certo.
   */
  it("com um período só, coincide com o cálculo de taxa única", () => {
    const plano = buildCreditoPlano({
      balanceCents: 80_000_00,
      startDate: "2026-01-01",
      maturityDate: "2046-01-01",
      periods: [{ startsOn: "2026-01-01", kind: "fixa", ratePct: 4 }],
      indexanteRates: {},
    });
    const simples = buildLoan({ principalCents: 80_000_00, annualRatePct: 4, termMonths: 240 });
    expect(plano.tramos).toHaveLength(1);
    expect(plano.tramos[0]!.months).toBe(240);
    expect(plano.currentPaymentCents).toBe(simples.monthlyPaymentCents);
    // A menos do resto do arredondamento, os juros são os mesmos.
    expect(plano.totalInterestCents).toBeGreaterThan(simples.totalInterestCents! - 100);
    expect(plano.totalInterestCents).toBeLessThanOrEqual(simples.totalInterestCents!);
    expect(plano.nextPaymentCents).toBeNull();
    expect(plano.nextChangeOn).toBeNull();
  });

  /**
   * A partir da primeira variável o plano é um cenário, não uma previsão: a
   * Euribor daqui a três anos ninguém sabe. Dizê-lo é a diferença entre uma
   * simulação e um número inventado com ar de facto.
   */
  it("marca onde o plano passa a ser cenário", () => {
    expect(buildCreditoPlano(misto).scenarioFrom).toBe("2029-01-01");
  });

  it("um crédito todo fixo não é cenário nenhum", () => {
    const plano = buildCreditoPlano({
      balanceCents: 50_000_00,
      startDate: "2026-01-01",
      maturityDate: "2036-01-01",
      periods: [{ startsOn: "2026-01-01", kind: "fixa", ratePct: 3 }],
      indexanteRates: {},
    });
    expect(plano.scenarioFrom).toBeNull();
  });

  it("um período que já começou conta a partir de hoje", () => {
    const plano = buildCreditoPlano({
      ...misto,
      // O crédito começou em 2020; hoje é 2026 e estamos a meio do troço fixo.
      periods: [
        { startsOn: "2020-01-01", kind: "fixa", ratePct: 3.3 },
        { startsOn: "2029-01-01", kind: "variavel", indexante: "euribor6m", spreadPct: 0.9 },
      ],
    });
    expect(plano.tramos[0]!.startsOn).toBe("2026-01-01");
    expect(plano.tramos[0]!.months).toBe(36);
  });

  it("ignora períodos que começam depois da maturidade", () => {
    const plano = buildCreditoPlano({
      ...misto,
      periods: [
        ...misto.periods,
        { startsOn: "2060-01-01", kind: "fixa", ratePct: 9 },
      ],
    });
    expect(plano.tramos).toHaveLength(2);
  });

  describe("recusa em vez de inventar", () => {
    it("sem o valor do indexante de um período variável", () => {
      const plano = buildCreditoPlano({ ...misto, indexanteRates: {} });
      expect(plano.tramos).toHaveLength(0);
      expect(plano.currentPaymentCents).toBeNull();
      expect(plano.problem).toContain("indexante");
    });

    it("sem a taxa de um período fixo", () => {
      const plano = buildCreditoPlano({
        ...misto,
        periods: [{ startsOn: "2026-01-01", kind: "fixa" }],
      });
      expect(plano.problem).toContain("taxa");
      expect(plano.currentPaymentCents).toBeNull();
    });

    /**
     * Quem escreveu os períodos disse que este crédito muda de taxa. Sem
     * maturidade não há como recalcular a prestação — e a alternativa cómoda
     * (voltar em silêncio ao cálculo de taxa única) mostraria a prestação de
     * hoje até ao fim do prazo num crédito que se sabe que não a mantém.
     */
    it("sem maturidade nenhuma", () => {
      for (const m of [null, undefined, "", "2056"]) {
        const plano = buildCreditoPlano({ ...misto, maturityDate: m });
        expect(plano.currentPaymentCents).toBeNull();
        expect(plano.problem).toContain("maturidade");
      }
    });

    it("com a maturidade no passado", () => {
      const plano = buildCreditoPlano({ ...misto, maturityDate: "2020-01-01" });
      expect(plano.problem).toContain("maturidade");
    });

    it("sem períodos nenhuns", () => {
      expect(buildCreditoPlano({ ...misto, periods: [] }).problem).toContain("períodos");
    });

    it("sem capital em dívida", () => {
      expect(buildCreditoPlano({ ...misto, balanceCents: 0 }).problem).toContain("capital");
    });
  });
});
