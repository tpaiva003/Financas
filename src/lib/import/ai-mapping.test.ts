import { describe, expect, it } from "vitest";
import {
  AI_MAX_CELL,
  AI_SAMPLE_ROWS,
  gridWidth,
  renderSample,
  sampleForModel,
  toHoldingMapping,
  toTradeMapping,
  type AiMappingAnswer,
} from "@/lib/import/ai-mapping";

/** Uma resposta completa, para os testes só mexerem no que lhes interessa. */
function resposta(patch: Partial<AiMappingAnswer> = {}): AiMappingAnswer {
  return {
    tipo: "movimentos",
    linhaCabecalho: 0,
    dataCol: 0,
    nomeCol: 1,
    quantidadeCol: 2,
    precoCol: 3,
    custoMedioCol: null,
    valorCol: 4,
    moedaCol: 5,
    taxaCambioCol: null,
    tipoOperacaoCol: null,
    notas: "Extrato de transações da Degiro.",
    ...patch,
  };
}

const GRELHA = [
  ["Data", "Produto", "Quantidade", "Preço", "Valor", ""],
  ["03-02-2026", "MSFT", "-4", "412,10", "-1648,40", "USD"],
  ["04-02-2026", "VWCE", "10", "112,30", "1123,00", "EUR"],
];

describe("sampleForModel", () => {
  it("manda poucas linhas e curtas, não o ficheiro", () => {
    const grande = Array.from({ length: 500 }, () => ["x".repeat(200), "y"]);
    const amostra = sampleForModel(grande);
    expect(amostra).toHaveLength(AI_SAMPLE_ROWS);
    // O ficheiro não sobe: sobe o cabeçalho e um punhado de linhas, truncadas.
    expect(amostra[0]![0]!.length).toBeLessThanOrEqual(AI_MAX_CELL + 1);
  });

  it("achata espaços para as linhas não se partirem", () => {
    expect(sampleForModel([["a\n b\tc"]])[0]![0]).toBe("a b c");
  });
});

describe("renderSample", () => {
  it("numera as colunas, que é o que se pede de volta", () => {
    const texto = renderSample(sampleForModel(GRELHA));
    expect(texto).toContain("colunas: [0] | [1] | [2] | [3] | [4] | [5]");
    expect(texto).toContain("linha 1: 03-02-2026 | MSFT | -4");
  });

  it("preenche as linhas curtas para as colunas ficarem alinhadas", () => {
    // Sem isto, uma linha a que falte a última célula desalinha tudo o que vem
    // a seguir e o modelo aponta a coluna ao lado.
    const texto = renderSample([["a", "b", "c"], ["1"]]);
    expect(texto).toContain("linha 1: 1 |  | ");
  });
});

describe("toTradeMapping", () => {
  it("converte uma resposta boa", () => {
    const m = toTradeMapping(resposta(), GRELHA);
    expect(m).toEqual({
      headerRow: 0,
      dateCol: 0,
      nameCol: 1,
      quantityCol: 2,
      priceCol: 3,
      amountCol: 4,
      currencyCol: 5,
      fxRateCol: -1,
      kindCol: -1,
    });
  });

  it("uma coluna a null vira -1, e não a coluna zero", () => {
    // Zero é a primeira coluna. Confundir "não existe" com "é a primeira" punha
    // a app a ler datas onde estão nomes.
    const m = toTradeMapping(resposta({ precoCol: null }), GRELHA);
    expect(m!.priceCol).toBe(-1);
  });

  it("descarta um índice fora da grelha", () => {
    // Se o modelo inventar uma coluna 9 num ficheiro de 6, isso não pode passar
    // a um mapeamento: importava-se com as colunas trocadas.
    const m = toTradeMapping(resposta({ valorCol: 9 }), GRELHA);
    expect(m!.amountCol).toBe(-1);
  });

  it("recusa a resposta inteira sem data, nome ou quantidade", () => {
    expect(toTradeMapping(resposta({ dataCol: null }), GRELHA)).toBeNull();
    expect(toTradeMapping(resposta({ nomeCol: null }), GRELHA)).toBeNull();
    expect(toTradeMapping(resposta({ quantidadeCol: 99 }), GRELHA)).toBeNull();
  });

  it("recusa uma linha de cabeçalho que não existe", () => {
    expect(toTradeMapping(resposta({ linhaCabecalho: 7 }), GRELHA)).toBeNull();
  });

  it("não devolve movimentos quando o modelo disse posições", () => {
    expect(toTradeMapping(resposta({ tipo: "posicoes" }), GRELHA)).toBeNull();
    expect(toTradeMapping(resposta({ tipo: "nenhum" }), GRELHA)).toBeNull();
  });

  it("aceita um índice decimal como ausente, não arredonda", () => {
    // Arredondar seria adivinhar. Entre apontar a coluna errada e não apontar
    // nenhuma, a segunda dá para corrigir à mão.
    const m = toTradeMapping(resposta({ valorCol: 2.7 }), GRELHA);
    expect(m!.amountCol).toBe(-1);
  });
});

describe("toHoldingMapping", () => {
  const POSICOES = [
    ["Produto", "Quantidade", "Preço médio", "Valor"],
    ["VWCE", "10", "98,20", "1123,00"],
  ];

  it("converte uma lista de posições", () => {
    const m = toHoldingMapping(
      resposta({
        tipo: "posicoes",
        dataCol: null,
        nomeCol: 0,
        quantidadeCol: 1,
        custoMedioCol: 2,
        precoCol: null,
        valorCol: 3,
        moedaCol: null,
      }),
      POSICOES,
    );
    expect(m).toEqual({
      headerRow: 0,
      nameCol: 0,
      quantityCol: 1,
      unitCostCol: 2,
      unitPriceCol: -1,
      marketValueCol: 3,
    });
  });

  it("sem nome ou quantidade não há posição nenhuma", () => {
    expect(
      toHoldingMapping(resposta({ tipo: "posicoes", nomeCol: null }), POSICOES),
    ).toBeNull();
  });
});

describe("gridWidth", () => {
  it("é a linha mais larga, não a primeira", () => {
    // A coluna da moeda costuma vir sem cabeçalho: a primeira linha é mais
    // curta do que as de baixo, e usá-la cortava essa coluna.
    expect(gridWidth([["a", "b"], ["1", "2", "USD"]])).toBe(3);
  });
});
