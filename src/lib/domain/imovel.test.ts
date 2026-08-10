import { describe, expect, it } from "vitest";

import {
  compararComRegistado,
  estimatedPropertyCents,
  normalizarLocal,
  ordemDoPeriodo,
  parseInePriceTable,
  procurarLocal,
  type InePriceRow,
} from "./imovel";

/**
 * Uma resposta do indicador do INE com o formato real: `Dados` a mapear período
 * para linhas, e os períodos escritos por extenso em português.
 */
function respostaIne(patch: Record<string, unknown> = {}) {
  return [
    {
      IndicadorCod: "0012234",
      IndicadorDsg: "Valor mediano das vendas de alojamentos familiares (€/m²)",
      Dados: {
        "4.º Trimestre de 2019": [{ geocod: "11A1312", geodsg: "Porto", valor: "1800" }],
        "1.º Trimestre de 2026": [
          { geocod: "11A1312", geodsg: "Porto", valor: "2890" },
          { geocod: "170", geodsg: "Lisboa", valor: "4123.5" },
        ],
      },
      ...patch,
    },
  ];
}

/**
 * Uma tabela ao jeito do INE: níveis misturados, com o código da freguesia a
 * começar pelo do concelho. É essa hierarquia que distingue os nomes repetidos.
 */
const LINHAS: InePriceRow[] = [
  { geocod: "11A", geodsg: "Área Metropolitana do Porto", pricePerM2Cents: 1800_00 },
  { geocod: "11A1312", geodsg: "Porto", pricePerM2Cents: 2890_00 },
  { geocod: "11A1312 06", geodsg: "Paranhos", pricePerM2Cents: 2450_00 },
  { geocod: "11A1317", geodsg: "Vila Nova de Gaia", pricePerM2Cents: 2100_00 },
  { geocod: "11B1815", geodsg: "Vila Nova de Foz Côa", pricePerM2Cents: 550_00 },
  { geocod: "170", geodsg: "Área Metropolitana de Lisboa", pricePerM2Cents: 3800_00 },
  { geocod: "1701109", geodsg: "Odivelas", pricePerM2Cents: 2200_00 },
  { geocod: "1701109 07", geodsg: "Odivelas", pricePerM2Cents: 2050_00 },
  { geocod: "150805", geodsg: "Lagoa", pricePerM2Cents: 2400_00 },
  { geocod: "204306", geodsg: "Lagoa", pricePerM2Cents: 1200_00 },
  // Os nomes de duas letras que trouxeram o caos: só devem aparecer se
  // alguém os escrever mesmo.
  { geocod: "11B0409", geodsg: "Tó", pricePerM2Cents: 300_00 },
  { geocod: "16A1602", geodsg: "Pó", pricePerM2Cents: 900_00 },
];

describe("normalizarLocal", () => {
  it("ignora acentos, maiúsculas e espaços a mais", () => {
    expect(normalizarLocal("  Vila Nova de Foz  Côa ")).toBe("vila nova de foz coa");
    expect(normalizarLocal("ÉVORA")).toBe("evora");
  });
});

describe("ordemDoPeriodo", () => {
  /**
   * As chaves do INE vêm por extenso. Ordenadas por texto, "4.º Trimestre de
   * 2019" ficava à frente de "1.º Trimestre de 2026" e a app mostrava preços de
   * há sete anos como se fossem os de agora.
   */
  it("põe 2026 à frente de 2019, apesar do texto dizer o contrário", () => {
    expect("4.º Trimestre de 2019" > "1.º Trimestre de 2026").toBe(true);
    expect(ordemDoPeriodo("1.º Trimestre de 2026")).toBeGreaterThan(
      ordemDoPeriodo("4.º Trimestre de 2019"),
    );
  });

  it("ordena os trimestres dentro do mesmo ano", () => {
    expect(ordemDoPeriodo("4.º Trimestre de 2025")).toBeGreaterThan(
      ordemDoPeriodo("1.º Trimestre de 2025"),
    );
  });
});

describe("parseInePriceTable", () => {
  it("fica com o período mais recente, e não com o que ordena melhor por texto", () => {
    const t = parseInePriceTable(respostaIne());

    expect(t?.period).toBe("1.º Trimestre de 2026");
    expect(t?.rows.find((r) => r.geodsg === "Porto")?.pricePerM2Cents).toBe(2890_00);
  });

  /**
   * O INE dá duas versões de cada número: `ind_string` para se ler e `valor`
   * para se usar. Lê-se o `valor`, onde o ponto é decimal.
   */
  it("lê o ponto do campo valor como decimal", () => {
    const t = parseInePriceTable([
      { Dados: { "2025": [{ geocod: "1", geodsg: "Sítio", valor: "2.08" }] } },
    ]);

    expect(t?.rows[0]?.pricePerM2Cents).toBe(2_08);
  });

  it("aguenta o formato português completo, com milhares e vírgula", () => {
    const t = parseInePriceTable([
      {
        Dados: {
          "2025": [
            { geocod: "1", geodsg: "Com milhares", valor: "1.234,56" },
            { geocod: "2", geodsg: "Com espaço", valor: "2 345,67" },
            { geocod: "3", geodsg: "À inglesa", valor: "3,456.78" },
          ],
        },
      },
    ]);

    expect(t?.rows.map((r) => r.pricePerM2Cents)).toEqual([1234_56, 2345_67, 3456_78]);
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
    expect(t?.rows[0]?.pricePerM2Cents).toBe(1000_00);
  });

  /**
   * Quando o indicador separa categorias de alojamento, o mesmo sítio vem mais
   * do que uma vez. Oito botões com o mesmo nome e preços diferentes não são
   * uma escolha.
   */
  it("fica com um sítio por código, mesmo que venha repetido", () => {
    const t = parseInePriceTable([
      {
        Dados: {
          "2025": [
            { geocod: "1312", geodsg: "Porto", valor: "2890", dim_3_t: "Total" },
            { geocod: "1312", geodsg: "Porto", valor: "3100", dim_3_t: "Apartamentos" },
            { geocod: "1312", geodsg: "Porto", valor: "2400", dim_3_t: "Moradias" },
          ],
        },
      },
    ]);

    expect(t?.rows).toHaveLength(1);
    expect(t?.rows[0]?.categoria).toBe("Total");
  });

  it("devolve null quando não reconhece o formato, em vez de uma tabela vazia", () => {
    expect(parseInePriceTable(null)).toBeNull();
    expect(parseInePriceTable({})).toBeNull();
    expect(parseInePriceTable([{ Dados: [] }])).toBeNull();
    expect(parseInePriceTable([{ Dados: { "2025": "nada disto" } }])).toBeNull();
    expect(parseInePriceTable("<html>erro</html>")).toBeNull();
  });
});

describe("procurarLocal", () => {
  /**
   * O caso que o Tiago viu no ecrã. "Paranhos, Porto" trazia oito vezes "Tó",
   * a freguesia de Mogadouro, porque "por-TO" contém "to" — e os oito
   * empurravam o Porto e Paranhos para fora da lista.
   */
  it('não traz "Tó" numa procura por "Paranhos, Porto"', () => {
    const r = procurarLocal(LINHAS, "Paranhos, Porto");

    const nomes = [r.escolhido?.row.geodsg, ...r.candidatos.map((c) => c.row.geodsg)];
    expect(nomes).not.toContain("Tó");
    expect(nomes).not.toContain("Pó");
  });

  it('escolhe Paranhos, e diz que é dentro do Porto', () => {
    const r = procurarLocal(LINHAS, "Paranhos, Porto");

    expect(r.escolhido?.row.geodsg).toBe("Paranhos");
    expect(r.escolhido?.dentroDe).toBe("Porto");
  });

  it("um nome de duas letras só aparece se for mesmo escrito", () => {
    const r = procurarLocal(LINHAS, "Tó");

    expect(r.escolhido?.row.geodsg).toBe("Tó");
    expect(r.exato).toBe(true);
  });

  it("não deixa um nome curto entrar por dentro de outra palavra", () => {
    for (const q of ["Matosinhos", "Portimão", "Loulé", "Alvalade"]) {
      const r = procurarLocal(LINHAS, q);
      const nomes = [r.escolhido?.row.geodsg, ...r.candidatos.map((c) => c.row.geodsg)];
      expect(nomes).not.toContain("Tó");
      expect(nomes).not.toContain("Pó");
    }
  });

  it("encontra o concelho pelo nome, sem acentos", () => {
    expect(procurarLocal(LINHAS, "porto").escolhido?.row.geodsg).toBe("Porto");
    expect(procurarLocal(LINHAS, "vila nova de foz coa").escolhido?.row.geodsg).toBe(
      "Vila Nova de Foz Côa",
    );
  });

  it("aceita o nome com palavras a mais à volta", () => {
    const r = procurarLocal(LINHAS, "concelho do Porto");

    expect(r.escolhido?.row.geodsg).toBe("Porto");
    expect(r.exato).toBe(false);
  });

  it('encontra "Vila Nova de Gaia" por "gaia"', () => {
    expect(procurarLocal(LINHAS, "gaia").escolhido?.row.geodsg).toBe("Vila Nova de Gaia");
  });

  it("dá candidatos quando o nome é parcial e há mais do que um", () => {
    const r = procurarLocal(LINHAS, "Vila Nova");

    expect(r.escolhido).toBeNull();
    expect(r.candidatos.map((c) => c.row.geodsg)).toEqual([
      "Vila Nova de Foz Côa",
      "Vila Nova de Gaia",
    ]);
  });

  it("aceita um nome parcial que só bate num sítio, mas diz que não foi exato", () => {
    const r = procurarLocal(LINHAS, "Foz Côa");

    expect(r.escolhido?.row.geodsg).toBe("Vila Nova de Foz Côa");
    expect(r.exato).toBe(false);
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

  /**
   * O mesmo nome em dois níveis: Odivelas é concelho e é freguesia dentro dele.
   * Sem dizer onde cada um está, o ecrã mostrava dois botões iguais com preços
   * diferentes e não havia forma de escolher.
   */
  it("distingue o concelho da freguesia com o mesmo nome", () => {
    const r = procurarLocal(LINHAS, "Odivelas");

    expect(r.escolhido).toBeNull();
    expect(r.candidatos).toHaveLength(2);
    // O mais abrangente primeiro: o campo pergunta pelo concelho.
    expect(r.candidatos[0]?.dentroDe).toBe("Área Metropolitana de Lisboa");
    expect(r.candidatos[1]?.dentroDe).toBe("Odivelas");
  });

  it("não inventa nada com o campo vazio", () => {
    expect(procurarLocal(LINHAS, "   ")).toEqual({
      escolhido: null,
      exato: false,
      candidatos: [],
    });
  });

  it("devolve vazio quando o sítio não existe mesmo", () => {
    const r = procurarLocal(LINHAS, "Vigo");

    expect(r.escolhido).toBeNull();
    expect(r.candidatos).toEqual([]);
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
