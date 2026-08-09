import { describe, expect, it } from "vitest";

import {
  compararComRegistado,
  estimatedPropertyCents,
  normalizarLocal,
  parseInePriceTable,
  procurarLocal,
  type InePriceRow,
} from "./imovel";

/**
 * Uma resposta do indicador do INE, com o formato que a API documenta: um array
 * com um objeto, e lá dentro `Dados` a mapear período para linhas.
 */
function respostaIne(patch: Record<string, unknown> = {}) {
  return [
    {
      IndicadorCod: "0012530",
      IndicadorDsg: "Valor mediano das vendas por m² de alojamentos familiares",
      DataExtracao: "2026-08-09",
      Dados: {
        "2024": [{ geocod: "1106", geodsg: "Lisboa", valor: "3500" }],
        "2025": [
          { geocod: "1106", geodsg: "Lisboa", valor: "4123.5" },
          { geocod: "1312", geodsg: "Porto", valor: "2890" },
          { geocod: "1117", geodsg: "Vila Franca de Xira", valor: "1650" },
        ],
      },
      ...patch,
    },
  ];
}

const LINHAS: InePriceRow[] = [
  { geocod: "1106", geodsg: "Lisboa", pricePerM2Cents: 4123_50 },
  { geocod: "1312", geodsg: "Porto", pricePerM2Cents: 2890_00 },
  { geocod: "1317", geodsg: "Vila Nova de Gaia", pricePerM2Cents: 2100_00 },
  { geocod: "1815", geodsg: "Vila Nova de Foz Côa", pricePerM2Cents: 550_00 },
  { geocod: "0805", geodsg: "Lagoa", pricePerM2Cents: 2400_00 },
  { geocod: "4306", geodsg: "Lagoa", pricePerM2Cents: 1200_00 },
];

describe("normalizarLocal", () => {
  it("ignora acentos, maiúsculas e espaços a mais", () => {
    expect(normalizarLocal("  Vila Nova de Foz  Côa ")).toBe("vila nova de foz coa");
    expect(normalizarLocal("ÉVORA")).toBe("evora");
  });
});

describe("parseInePriceTable", () => {
  it("fica com o período mais recente", () => {
    const t = parseInePriceTable(respostaIne());

    expect(t?.period).toBe("2025");
    expect(t?.rows).toHaveLength(3);
    expect(t?.rows[0]).toEqual({ geocod: "1106", geodsg: "Lisboa", pricePerM2Cents: 4123_50 });
  });

  it("aceita vírgula decimal", () => {
    const t = parseInePriceTable([
      { Dados: { "2025": [{ geocod: "1", geodsg: "Sítio", valor: "1234,56" }] } },
    ]);

    expect(t?.rows[0]?.pricePerM2Cents).toBe(1234_56);
  });

  it("deita fora as linhas sem valor, que o INE usa onde houve poucas vendas", () => {
    const t = parseInePriceTable([
      {
        Dados: {
          "2025": [
            { geocod: "1", geodsg: "Com valor", valor: "1000" },
            { geocod: "2", geodsg: "Sem valor", valor: "" },
            { geocod: "3", geodsg: "Zero", valor: "0" },
          ],
        },
      },
    ]);

    expect(t?.rows).toHaveLength(1);
    expect(t?.rows[0]?.geodsg).toBe("Com valor");
  });

  /**
   * A distinção que interessa: um formato que não se reconhece devolve `null` e
   * não uma tabela vazia. Vazia lê-se como "o teu concelho não está lá" e manda
   * procurar o erro no sítio errado.
   */
  it("devolve null quando não reconhece o formato, em vez de uma tabela vazia", () => {
    expect(parseInePriceTable(null)).toBeNull();
    expect(parseInePriceTable({})).toBeNull();
    expect(parseInePriceTable([{ Dados: [] }])).toBeNull();
    expect(parseInePriceTable([{ Dados: { "2025": "nada disto" } }])).toBeNull();
    expect(parseInePriceTable("<html>erro</html>")).toBeNull();
  });
});

describe("procurarLocal", () => {
  it("escolhe sozinho quando o nome bate certo", () => {
    const r = procurarLocal(LINHAS, "porto");

    expect(r.escolhido?.exato).toBe(true);
    expect(r.escolhido?.row.geocod).toBe("1312");
  });

  it("ignora acentos no que se escreveu", () => {
    const r = procurarLocal(LINHAS, "vila nova de foz coa");

    expect(r.escolhido?.row.geocod).toBe("1815");
  });

  /**
   * Há duas Lagoas em Portugal, uma no Algarve e outra nos Açores, e os preços
   * são o dobro numa da outra. Escolher a primeira era acertar por sorte.
   */
  it("não desempata dois sítios com o mesmo nome", () => {
    const r = procurarLocal(LINHAS, "Lagoa");

    expect(r.escolhido).toBeNull();
    expect(r.candidatos).toHaveLength(2);
  });

  it("dá candidatos quando o nome é parcial e há mais do que um", () => {
    const r = procurarLocal(LINHAS, "Vila Nova");

    expect(r.escolhido).toBeNull();
    expect(r.candidatos.map((c) => c.geodsg)).toEqual([
      "Vila Nova de Gaia",
      "Vila Nova de Foz Côa",
    ]);
  });

  it("aceita um nome parcial que só bate num sítio, mas diz que não foi exato", () => {
    const r = procurarLocal(LINHAS, "Foz Côa");

    expect(r.escolhido?.row.geocod).toBe("1815");
    expect(r.escolhido?.exato).toBe(false);
  });

  it("não inventa nada com o campo vazio", () => {
    expect(procurarLocal(LINHAS, "   ")).toEqual({ escolhido: null, candidatos: [] });
  });
});

describe("estimatedPropertyCents", () => {
  it("é a área vezes o preço por metro", () => {
    expect(estimatedPropertyCents({ areaM2: 90, priceRefCents: 2000_00 })).toBe(180_000_00);
  });

  /**
   * Faltando a área ou o preço não há estimativa nenhuma. Assumir uma área
   * média punha um valor de imóvel inventado dentro do património — que é o
   * número que a app existe para mostrar.
   */
  it("recusa-se a estimar sem área ou sem preço", () => {
    expect(estimatedPropertyCents({ areaM2: 90 })).toBeNull();
    expect(estimatedPropertyCents({ priceRefCents: 2000_00 })).toBeNull();
    expect(estimatedPropertyCents({ areaM2: 0, priceRefCents: 2000_00 })).toBeNull();
    expect(estimatedPropertyCents({ areaM2: -90, priceRefCents: 2000_00 })).toBeNull();
    expect(estimatedPropertyCents({})).toBeNull();
  });
});

describe("compararComRegistado", () => {
  it("diz a diferença e a razão", () => {
    const c = compararComRegistado(180_000_00, 150_000_00);

    expect(c?.difCents).toBe(30_000_00);
    expect(c?.ratio).toBeCloseTo(1.2, 5);
  });

  it("devolve null sem termo de comparação, em vez de zero", () => {
    expect(compararComRegistado(180_000_00, null)).toBeNull();
    expect(compararComRegistado(180_000_00, 0)).toBeNull();
    expect(compararComRegistado(null, 150_000_00)).toBeNull();
  });
});
