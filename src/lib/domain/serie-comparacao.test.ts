import { describe, expect, it } from "vitest";
import {
  fechosDeMes,
  precoNoDia,
  rumoDoDesnivel,
  serieDaComparacao,
  type PrecosPorDia,
} from "./serie-comparacao";

describe("fechosDeMes", () => {
  it("dá o último dia de cada mês", () => {
    expect(fechosDeMes("2026-01-15", "2026-03-20")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-20",
    ]);
  });

  it("não passa da data final", () => {
    const f = fechosDeMes("2026-01-01", "2026-01-10");
    expect(f).toEqual(["2026-01-10"]);
  });

  it("atravessa o fim do ano", () => {
    expect(fechosDeMes("2025-11-05", "2026-01-31")).toEqual([
      "2025-11-30",
      "2025-12-31",
      "2026-01-31",
    ]);
  });
});

describe("precoNoDia", () => {
  const precos: PrecosPorDia = { "2026-01-30": 100, "2026-02-02": 110 };

  it("recua até ao dia útil anterior", () => {
    // 31 de janeiro de 2026 é sábado: o preço é o de sexta.
    expect(precoNoDia(precos, "2026-01-31")).toBe(100);
  });

  it("não inventa um preço quando não há nenhum por perto", () => {
    expect(precoNoDia(precos, "2026-01-05")).toBeNull();
  });

  it("nunca devolve um preço de uma data futura", () => {
    expect(precoNoDia(precos, "2026-02-01")).toBe(100);
  });
});

describe("serieDaComparacao", () => {
  it("uma venda não faz a carteira desabar contra um índice que nunca vendeu", () => {
    /**
     * O espelho do problema do `simulateBenchmark`.
     *
     * Compra de 10 000 € em janeiro; no fim de março vende-se tudo por
     * 12 000 €. A
     * carteira fica sem posições abertas — e o `carteiraEm` devolve zero, que é
     * verdade sobre as posições e mentira sobre o dinheiro.
     *
     * O índice, esse, só recebia as entradas e nunca vendia nada: ficava com os
     * 10 000 € a render. O gráfico desenhava a linha da carteira a cair a pique
     * para zero enquanto a do índice subia — um desnível de doze mil euros que
     * o mercado não fez, feito só de dinheiro que está na conta.
     */
    const pontos = serieDaComparacao({
      fluxos: [
        { date: "2026-01-10", amountCents: 1_000_000 },
        { date: "2026-03-31", amountCents: -1_200_000 },
      ],
      precosDoIndice: {
        "2026-01-10": 100,
        "2026-01-31": 100,
        "2026-02-28": 105,
        "2026-03-31": 110,
      },
      carteiraEm: (dia) =>
        ({ "2026-01-31": 1_050_000, "2026-02-28": 1_100_000, "2026-03-31": 0 })[dia] ?? null,
      de: "2026-01-10",
      ate: "2026-03-31",
    });

    const marco = pontos.at(-1)!;
    // A carteira não tem posições, mas tem os 12 000 € que voltaram.
    expect(marco.carteiraCents).toBe(1_200_000);
    // O índice: 10 000 € a 100 valem 11 000 € a 110. Nem mais, nem menos.
    expect(marco.indiceCents).toBe(1_100_000);
    expect(marco.diferencaCents).toBe(100_000);
    // O investido é o que se pôs, não o que se pôs menos o que se tirou.
    expect(marco.investidoCents).toBe(1_000_000);
  });


  /** Preços redondos e inventados: nada de mercado real, nem em teste. */
  const precosDoIndice: PrecosPorDia = {
    "2026-01-30": 100,
    "2026-02-27": 110,
    "2026-03-31": 120,
  };

  it("dá o mesmo dinheiro aos dois lados, nas mesmas datas", () => {
    const pontos = serieDaComparacao({
      fluxos: [{ date: "2026-01-30", amountCents: 100_000 }],
      precosDoIndice,
      // A carteira segue o mesmo caminho do índice: as linhas ficam coladas.
      carteiraEm: (d) =>
        d.startsWith("2026-01") ? 100_000 : d.startsWith("2026-02") ? 110_000 : 120_000,
      de: "2026-01-15",
      ate: "2026-03-31",
    });

    expect(pontos).toHaveLength(3);
    expect(pontos.map((p) => p.diferencaCents)).toEqual([0, 0, 0]);
    expect(pontos[2]!.investidoCents).toBe(100_000);
  });

  it("um reforço a meio compra unidades ao preço daquele dia", () => {
    const pontos = serieDaComparacao({
      fluxos: [
        { date: "2026-01-30", amountCents: 100_000 },
        { date: "2026-02-27", amountCents: 110_000 },
      ],
      precosDoIndice,
      carteiraEm: () => 0,
      de: "2026-01-15",
      ate: "2026-03-31",
    });

    // Em março: 1000 unidades a 100 mais 1000 a 110, tudo a 120.
    const marco = pontos.find((p) => p.mes === "2026-03")!;
    expect(marco.indiceCents).toBe(240_000);
    expect(marco.investidoCents).toBe(210_000);
  });

  /**
   * Um ponto inventado no meio de uma série lê-se como uma medição — e a
   * distância entre as duas linhas é precisamente o que se veio aqui ler.
   */
  it("um mês sem valor da carteira não se desenha", () => {
    const pontos = serieDaComparacao({
      fluxos: [{ date: "2026-01-30", amountCents: 100_000 }],
      precosDoIndice,
      carteiraEm: (d) => (d.startsWith("2026-02") ? null : 100_000),
      de: "2026-01-15",
      ate: "2026-03-31",
    });

    expect(pontos.map((p) => p.mes)).toEqual(["2026-01", "2026-03"]);
  });

  it("um mês sem cotação do índice também não", () => {
    const pontos = serieDaComparacao({
      fluxos: [{ date: "2026-01-30", amountCents: 100_000 }],
      precosDoIndice: { "2026-01-30": 100 },
      carteiraEm: () => 100_000,
      de: "2026-01-15",
      ate: "2026-03-31",
    });

    expect(pontos.map((p) => p.mes)).toEqual(["2026-01"]);
  });

  /**
   * Deitar fora uma entrada sem preço tirava dinheiro ao índice e fazia-o
   * parecer pior do que foi.
   */
  it("não desenha um mês em que uma entrada não tem preço no índice", () => {
    const pontos = serieDaComparacao({
      fluxos: [{ date: "2025-06-01", amountCents: 50_000 }],
      precosDoIndice,
      carteiraEm: () => 100_000,
      de: "2026-01-15",
      ate: "2026-03-31",
    });

    expect(pontos).toEqual([]);
  });

  it("datas ao contrário não dão série nenhuma", () => {
    expect(
      serieDaComparacao({
        fluxos: [],
        precosDoIndice,
        carteiraEm: () => 0,
        de: "2026-03-31",
        ate: "2026-01-01",
      }),
    ).toEqual([]);
  });
});

describe("rumoDoDesnivel", () => {
  const ponto = (mes: string, diferencaCents: number) => ({
    mes,
    carteiraCents: 0,
    indiceCents: 0,
    diferencaCents,
    investidoCents: 0,
  });

  /**
   * O mesmo "estás atrás 8 mil" são conclusões opostas conforme o caminho: de
   * −20 mil para −8 mil é recuperar; de zero para −8 mil é perder terreno.
   */
  it("estar atrás mas a recuperar conta como melhoria", () => {
    const r = rumoDoDesnivel([ponto("2026-01", -20_000), ponto("2026-03", -8_000)])!;
    expect(r.melhorou).toBe(true);
    expect(r.de).toBe(-20_000);
    expect(r.para).toBe(-8_000);
  });

  it("estar atrás e a afastar-se não conta como melhoria", () => {
    expect(rumoDoDesnivel([ponto("2026-01", 0), ponto("2026-03", -8_000)])!.melhorou).toBe(false);
  });

  it("uma tendência de um ponto não é tendência", () => {
    expect(rumoDoDesnivel([ponto("2026-01", -8_000)])).toBeNull();
    expect(rumoDoDesnivel([])).toBeNull();
  });
});
