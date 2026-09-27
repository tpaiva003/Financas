import { describe, expect, it } from "vitest";
import {
  mesesDeAtraso,
  parseEuriborBCE,
  periodoPorExtenso,
  ultimaEuribor,
  urlDaSerie,
} from "./euribor";

/**
 * A forma da resposta do BCE. Os valores vêm indexados por POSIÇÃO e os
 * períodos numa lista à parte, na mesma ordem — casá-los pela ordem das chaves
 * do objeto seria confiar na ordem de um JSON.
 */
function resposta(pares: [string, number][]): string {
  const observations: Record<string, [number]> = {};
  pares.forEach(([, v], i) => {
    observations[String(i)] = [v];
  });
  return JSON.stringify({
    dataSets: [{ series: { "0:0:0:0:0:0": { observations } } }],
    structure: {
      dimensions: {
        observation: [{ id: "TIME_PERIOD", values: pares.map(([p]) => ({ id: p })) }],
      },
    },
  });
}

describe("parseEuriborBCE", () => {
  it("lê os valores com o mês a que pertencem", () => {
    const r = parseEuriborBCE(
      resposta([
        ["2026-05", 2.084],
        ["2026-06", 2.121],
        ["2026-07", 2.142],
      ]),
    );
    expect(r).toEqual([
      { periodo: "2026-05", pct: 2.084 },
      { periodo: "2026-06", pct: 2.121 },
      { periodo: "2026-07", pct: 2.142 },
    ]);
  });

  it("casa o valor com o período pelo índice, não pela ordem de leitura", () => {
    // A posição "2" tem de casar com o terceiro período, apareça onde aparecer.
    const bruto = JSON.parse(
      resposta([
        ["2026-05", 1],
        ["2026-06", 2],
        ["2026-07", 3],
      ]),
    );
    const baralhado = { "2": [3], "0": [1], "1": [2] };
    bruto.dataSets[0].series["0:0:0:0:0:0"].observations = baralhado;
    const r = parseEuriborBCE(JSON.stringify(bruto));
    expect(r.find((x) => x.periodo === "2026-07")?.pct).toBe(3);
    expect(r.find((x) => x.periodo === "2026-05")?.pct).toBe(1);
  });

  /**
   * Uma resposta que mudou de forma não pode deitar abaixo o formulário do
   * crédito: o campo continua a escrever-se à mão, como já se escrevia.
   */
  it("devolve vazio em vez de atirar quando a resposta não presta", () => {
    expect(parseEuriborBCE("isto não é json")).toEqual([]);
    expect(parseEuriborBCE("{}")).toEqual([]);
    expect(parseEuriborBCE(JSON.stringify({ dataSets: [{ series: {} }] }))).toEqual([]);
  });

  it("ignora observações sem número", () => {
    const bruto = JSON.parse(resposta([["2026-07", 2.1]]));
    bruto.dataSets[0].series["0:0:0:0:0:0"].observations["0"] = [null];
    expect(parseEuriborBCE(JSON.stringify(bruto))).toEqual([]);
  });
});

describe("ultimaEuribor", () => {
  it("é a mais recente, e nada quando não há", () => {
    expect(
      ultimaEuribor([
        { periodo: "2026-05", pct: 2 },
        { periodo: "2026-07", pct: 2.1 },
      ]),
    ).toEqual({ periodo: "2026-07", pct: 2.1 });
    expect(ultimaEuribor([])).toBeNull();
  });
});

describe("mesesDeAtraso", () => {
  it("o mês passado é o normal e não é atraso nenhum a assinalar", () => {
    // O BCE publica a média de um mês depois de ele acabar.
    expect(mesesDeAtraso("2026-07", "2026-08")).toBe(1);
  });

  it("conta por cima da mudança de ano", () => {
    expect(mesesDeAtraso("2025-11", "2026-02")).toBe(3);
  });
});

describe("urlDaSerie", () => {
  it("aponta para a série do prazo pedido, com a média do período", () => {
    const u = urlDaSerie("euribor6m");
    expect(u).toContain("EURIBOR6MD_");
    // `HSTA` é a média do período: os contratos portugueses revêem-se por uma
    // média mensal, não pelo fixing de um dia.
    expect(u).toContain("HSTA");
    expect(urlDaSerie("euribor12m")).toContain("EURIBOR1YD_");
  });
});

describe("periodoPorExtenso", () => {
  it("escreve o mês por extenso", () => {
    expect(periodoPorExtenso("2026-07")).toContain("2026");
    expect(periodoPorExtenso("lixo")).toBe("lixo");
  });
});
