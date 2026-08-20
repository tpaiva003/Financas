import { describe, expect, it } from "vitest";
import {
  describeTradeMapping,
  detectTradeMapping,
  groupTradesByName,
  newTradesOnly,
  parseRate,
  rowsToTrades,
  tradeKindOf,
} from "./trades";
import type { Grid } from "./columns";

/** Um extrato de transações no formato da Degiro, com as colunas de moeda soltas. */
const DEGIRO: Grid = [
  ["Data", "Hora", "Produto", "ISIN", "Bolsa", "Quantidade", "Preços", "", "Valor local", "", "Taxa de câmbio"],
  ["02-01-2025", "09:05", "VANGUARD FTSE AW", "IE00BK5BQT80", "XET", "10", "100,50", "EUR", "-1005,00", "EUR", ""],
  ["15-06-2025", "10:11", "APPLE INC", "US0378331005", "NDQ", "5", "180,00", "USD", "-900,00", "USD", "1,0912"],
  ["20-11-2025", "14:30", "VANGUARD FTSE AW", "IE00BK5BQT80", "XET", "-4", "110,00", "EUR", "440,00", "EUR", ""],
];

describe("detectTradeMapping", () => {
  it("encontra data, produto e quantidade num extrato de transações", () => {
    const m = detectTradeMapping(DEGIRO)!;
    expect(m).not.toBeNull();
    expect(m.headerRow).toBe(0);
    expect(m.dateCol).toBe(0);
    expect(m.nameCol).toBe(2);
    expect(m.quantityCol).toBe(5);
    expect(m.priceCol).toBe(6);
  });

  it("prefere a correspondência exata: 'valor local' não rouba o lugar a 'valor'", () => {
    const m = detectTradeMapping(DEGIRO)!;
    expect(m.amountCol).toBe(8);
  });

  it("não aceita um cabeçalho cujo corpo não tem datas", () => {
    const semDatas: Grid = [
      ["Data", "Produto", "Quantidade"],
      ["isto não é data", "X", "1"],
      ["nem isto", "Y", "2"],
    ];
    expect(detectTradeMapping(semDatas)).toBeNull();
  });

  it("devolve nada quando o ficheiro é de posições, sem data", () => {
    const posicoes: Grid = [
      ["Produto", "Quantidade", "Preço de fecho"],
      ["VWCE", "100", "110,00"],
    ];
    expect(detectTradeMapping(posicoes)).toBeNull();
  });

  it("salta linhas de título antes do cabeçalho", () => {
    const comTitulo: Grid = [
      ["Extrato de transações"],
      [],
      ["Data", "Produto", "Quantidade", "Preço"],
      ["02-01-2025", "VWCE", "10", "100,00"],
    ];
    expect(detectTradeMapping(comTitulo)!.headerRow).toBe(2);
  });
});

describe("tradeKindOf", () => {
  it("sem coluna de tipo, o sinal da quantidade decide", () => {
    expect(tradeKindOf("", 10)).toBe("compra");
    expect(tradeKindOf("", -4)).toBe("venda");
  });

  it("a coluna de tipo ganha ao sinal: é o que a corretora diz", () => {
    expect(tradeKindOf("Venda", 10)).toBe("venda");
    expect(tradeKindOf("Sell", 10)).toBe("venda");
    expect(tradeKindOf("Compra", -10)).toBe("compra");
  });

  it("reconhece dividendos e custos", () => {
    expect(tradeKindOf("Dividendo", 0)).toBe("dividendo");
    expect(tradeKindOf("Comissão de transação", 0)).toBe("custo");
    expect(tradeKindOf("Imposto de selo", 0)).toBe("custo");
  });
});

describe("rowsToTrades", () => {
  const rows = rowsToTrades(DEGIRO, detectTradeMapping(DEGIRO)!);

  it("lê as três operações, com datas em ISO", () => {
    expect(rows).toHaveLength(3);
    expect(rows[0]!.date).toBe("2025-01-02");
    expect(rows[2]!.date).toBe("2025-11-20");
  });

  it("uma quantidade negativa é uma venda, e a quantidade fica positiva", () => {
    expect(rows[2]!.kind).toBe("venda");
    expect(rows[2]!.quantity).toBe(4);
  });

  it("guarda a moeda estrangeira e o câmbio, e ignora o euro", () => {
    expect(rows[0]!.currency).toBeNull();
    expect(rows[1]!.currency).toBe("USD");
    expect(rows[1]!.fxRate).toBeCloseTo(1.0912, 6);
  });

  it("os valores ficam positivos: o sentido está no tipo, não no sinal", () => {
    expect(rows[0]!.amountCents).toBe(100_500);
    expect(rows[2]!.amountCents).toBe(44_000);
  });

  it("salta linhas sem data, sem nome, ou vazias", () => {
    const sujo: Grid = [
      ["Data", "Produto", "Quantidade", "Valor"],
      ["02-01-2025", "VWCE", "10", "1000,00"],
      ["", "SEM DATA", "5", "500,00"],
      ["03-01-2025", "", "5", "500,00"],
      ["04-01-2025", "SEM NADA", "", ""],
      ["total", "", "", "1500,00"],
    ];
    const lidas = rowsToTrades(sujo, detectTradeMapping(sujo)!);
    expect(lidas).toHaveLength(1);
    expect(lidas[0]!.name).toBe("VWCE");
  });

  it("aguenta quantidades com separador de milhares", () => {
    const grande: Grid = [
      ["Data", "Produto", "Quantidade", "Valor"],
      ["02-01-2025", "OBRIGACAO", "1.500", "1500,00"],
    ];
    expect(rowsToTrades(grande, detectTradeMapping(grande)!)[0]!.quantity).toBe(1500);
  });
});

describe("groupTradesByName", () => {
  it("junta as operações do mesmo produto, mais movimentadas primeiro", () => {
    const grupos = groupTradesByName(rowsToTrades(DEGIRO, detectTradeMapping(DEGIRO)!));
    expect(grupos).toHaveLength(2);
    expect(grupos[0]!.name).toBe("VANGUARD FTSE AW");
    expect(grupos[0]!.trades).toHaveLength(2);
    expect(grupos[1]!.name).toBe("APPLE INC");
  });
});

describe("describeTradeMapping", () => {
  it("diz em português que colunas foram usadas", () => {
    const texto = describeTradeMapping(DEGIRO, detectTradeMapping(DEGIRO)!);
    expect(texto).toContain("data: Data");
    expect(texto).toContain("ativo: Produto");
    expect(texto).toContain("quantidade: Quantidade");
  });
});

describe("parseRate", () => {
  it("quatro casas decimais são decimais, não milhares", () => {
    // O leitor de dinheiro vê "1,0912" como 10912, porque em euros ninguém
    // escreve quatro casas. Numa taxa de câmbio escreve-se sempre.
    expect(parseRate("1,0912")).toBeCloseTo(1.0912, 6);
    expect(parseRate("1.0912")).toBeCloseTo(1.0912, 6);
  });

  it("aceita taxas grandes, como o iene", () => {
    expect(parseRate("161,45")).toBeCloseTo(161.45, 6);
  });

  it("recusa o que não é taxa", () => {
    expect(parseRate("")).toBeNull();
    expect(parseRate("N/D")).toBeNull();
    expect(parseRate("0")).toBeNull();
    expect(parseRate("-1,09")).toBeNull();
  });
});

describe("newTradesOnly", () => {
  const compra = (date: string, quantity: number, amountCents: number) => ({
    date,
    kind: "compra",
    quantity,
    amountCents,
  });

  it("reimportar o mesmo ficheiro não acrescenta nada", () => {
    const ficheiro = [compra("2025-01-02", 10, 100_000), compra("2025-06-10", 5, 55_000)];
    const r = newTradesOnly(ficheiro, ficheiro);
    expect(r.fresh).toHaveLength(0);
    expect(r.duplicates).toBe(2);
  });

  it("execuções parciais iguais no mesmo dia não são apagadas", () => {
    // Uma ordem partida em três pela corretora: são três movimentos a sério.
    const tres = [
      compra("2025-01-02", 10, 100_000),
      compra("2025-01-02", 10, 100_000),
      compra("2025-01-02", 10, 100_000),
    ];
    expect(newTradesOnly(tres, []).fresh).toHaveLength(3);
  });

  it("com duas já gravadas de três iguais, importa só a que falta", () => {
    const tres = [
      compra("2025-01-02", 10, 100_000),
      compra("2025-01-02", 10, 100_000),
      compra("2025-01-02", 10, 100_000),
    ];
    const r = newTradesOnly(tres, tres.slice(0, 2));
    expect(r.fresh).toHaveLength(1);
    expect(r.duplicates).toBe(2);
  });

  it("um movimento diferente entra, mesmo com outros iguais à volta", () => {
    const existentes = [compra("2025-01-02", 10, 100_000)];
    const ficheiro = [compra("2025-01-02", 10, 100_000), compra("2025-01-02", 10, 110_000)];
    const r = newTradesOnly(ficheiro, existentes);
    expect(r.fresh).toHaveLength(1);
    expect(r.fresh[0]!.amountCents).toBe(110_000);
  });

  it("uma venda não é confundida com a compra igual", () => {
    const r = newTradesOnly(
      [{ date: "2025-01-02", kind: "venda", quantity: 10, amountCents: 100_000 }],
      [compra("2025-01-02", 10, 100_000)],
    );
    expect(r.fresh).toHaveLength(1);
  });
});

describe("a coluna da bolsa", () => {
  const grelha = [
    ["Data", "Produto", "Bolsa", "Quantidade", "Preço", "Valor", "Moeda"],
    ["07-04-2025", "ALPHABET INC. CLASS A", "NDQ", "25", "141,24", "3531,00", "USD"],
    ["14-05-2024", "VANGUARD FTSE ALL-WORLD", "EAM", "5", "112,50", "562,50", "EUR"],
  ];

  it("é lida quando o ficheiro a traz", () => {
    const mapping = detectTradeMapping(grelha);
    const linhas = rowsToTrades(grelha, mapping!);

    expect(linhas.map((l) => l.exchange)).toEqual(["NDQ", "EAM"]);
  });

  /**
   * A praça é a pista mais fiável para o símbolo: duas empresas com nomes
   * parecidos em países diferentes são a forma mais fácil de acertar no ticker
   * errado, e esta coluna resolve isso de graça.
   */
  it("fica nula num ficheiro que não a tenha, sem estragar o resto", () => {
    const semBolsa = [
      ["Data", "Produto", "Quantidade", "Valor"],
      ["07-04-2025", "ALPHABET INC. CLASS A", "25", "3531,00"],
    ];
    const mapping = detectTradeMapping(semBolsa);
    const linhas = rowsToTrades(semBolsa, mapping!);

    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.exchange).toBeNull();
  });

  it("não confunde a bolsa com a moeda", () => {
    const mapping = detectTradeMapping(grelha);
    const linhas = rowsToTrades(grelha, mapping!);

    expect(linhas[0]!.currency).toBe("USD");
    expect(linhas[0]!.exchange).toBe("NDQ");
  });
});

/**
 * O ficheiro que importou uma compra de 493,98 EUR como 493 975,00 EUR.
 *
 * O ponto é o decimal em toda a coluna, mas naquela linha tinha TRÊS casas — e
 * a regra portuguesa lê três dígitos depois de um ponto como milhares. As
 * linhas ao lado, com duas casas, eram lidas bem: é o que torna isto difícil de
 * ver, porque a coluna parece certa.
 */
describe("um ficheiro com decimais escritos com ponto", () => {
  const grelha = [
    ["Data", "Produto", "Quantidade", "Preço", "Valor"],
    ["02-06-2025", "ETF QUALQUER", "5", "98.795", "493.975"],
    ["10-03-2025", "ETF QUALQUER", "5", "100.00", "500.00"],
    ["09-09-2024", "ETF QUALQUER", "6", "92.56", "555.36"],
  ];

  it("lê 493.975 como 493,98 e não como 493 975", () => {
    const mapping = detectTradeMapping(grelha);
    const linhas = rowsToTrades(grelha, mapping!);

    expect(linhas[0]!.amountCents).toBe(49398);
    expect(linhas[1]!.amountCents).toBe(50000);
    expect(linhas[2]!.amountCents).toBe(55536);
  });

  it("o preço por unidade segue a mesma regra", () => {
    const mapping = detectTradeMapping(grelha);
    const linhas = rowsToTrades(grelha, mapping!);

    expect(linhas[0]!.unitPriceCents).toBe(9880);
  });

  it("não estraga um ficheiro à portuguesa", () => {
    const pt = [
      ["Data", "Produto", "Quantidade", "Valor"],
      ["18-07-2022", "ACAO", "20", "2.235,55"],
      ["26-07-2022", "ACAO", "10", "1.050,00"],
    ];
    const mapping = detectTradeMapping(pt);
    const linhas = rowsToTrades(pt, mapping!);

    expect(linhas[0]!.amountCents).toBe(223555);
    expect(linhas[1]!.amountCents).toBe(105000);
  });
})
