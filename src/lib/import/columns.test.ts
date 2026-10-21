import { describe, it, expect } from "vitest";
import {
  detectDecimalSeparator,
  parseAmountCents,
  parseDate,
  detectMapping,
  rowsToTransactions,
  headerFingerprint,
  type Grid,
} from "./columns";

describe("parseAmountCents (formato europeu)", () => {
  it("lê vírgula decimal e ponto de milhares", () => {
    expect(parseAmountCents("12,34")).toBe(1234);
    expect(parseAmountCents("1.234,56")).toBe(123456);
    expect(parseAmountCents("1 234,56 €")).toBe(123456);
  });

  it("lê formato anglo-saxónico quando é inequívoco", () => {
    expect(parseAmountCents("12.34")).toBe(1234);
    expect(parseAmountCents("1,234.56")).toBe(123456);
  });

  it("trata negativos, incluindo parêntesis", () => {
    expect(parseAmountCents("-45,20")).toBe(-4520);
    expect(parseAmountCents("(45,20)")).toBe(-4520);
  });

  it("devolve null para o que não é número", () => {
    expect(parseAmountCents("")).toBeNull();
    expect(parseAmountCents("saldo")).toBeNull();
  });

  it("não confunde milhares com decimais", () => {
    expect(parseAmountCents("1.234")).toBe(123400);
    expect(parseAmountCents("1,5")).toBe(150);
  });
});

describe("parseDate", () => {
  it("aceita dd/mm/aaaa (formato português)", () => {
    expect(parseDate("02/07/2026")).toBe("2026-07-02");
    expect(parseDate("2-7-2026")).toBe("2026-07-02");
  });

  it("aceita ISO e ano a 2 dígitos", () => {
    expect(parseDate("2026-07-02")).toBe("2026-07-02");
    expect(parseDate("02.07.26")).toBe("2026-07-02");
  });

  it("rejeita datas inválidas e texto", () => {
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("descrição")).toBeNull();
    expect(parseDate("")).toBeNull();
  });
});

describe("detectMapping + rowsToTransactions", () => {
  it("deteta cabeçalho com coluna única de montante (gastos negativos)", () => {
    const grid: Grid = [
      ["Extrato de conta"],
      [""],
      ["Data Valor", "Descrição", "Montante"],
      ["02/07/2026", "COMPRA CONTINENTE", "-45,20"],
      ["03/07/2026", "TRANSFERENCIA RECEBIDA", "100,00"],
    ];
    const m = detectMapping(grid)!;
    expect(m.headerRow).toBe(2);
    expect(m.dateCol).toBe(0);
    expect(m.descriptionCol).toBe(1);
    expect(m.amountCol).toBe(2);
    expect(m.invertSign).toBe(true);

    const txs = rowsToTransactions(grid, m, "activo");
    expect(txs).toHaveLength(2);
    // Gasto fica positivo; entrada fica negativa (reembolso).
    expect(txs[0]).toMatchObject({ description: "COMPRA CONTINENTE", amountCents: 4520, transactionDate: "2026-07-02" });
    expect(txs[1]!.amountCents).toBe(-10000);
  });

  it("suporta colunas separadas de débito e crédito", () => {
    const grid: Grid = [
      ["Data", "Descritivo", "Débito", "Crédito"],
      ["02/07/2026", "SUPERMERCADO", "45,20", ""],
      ["03/07/2026", "DEVOLUCAO", "", "12,00"],
    ];
    const m = detectMapping(grid)!;
    expect(m.debitCol).toBe(2);
    expect(m.creditCol).toBe(3);
    expect(m.amountCol).toBe(-1);

    const txs = rowsToTransactions(grid, m, "bankinter");
    expect(txs.map((t) => t.amountCents)).toEqual([4520, -1200]);
  });

  it("ignora linhas de saldo/total e linhas sem data", () => {
    const grid: Grid = [
      ["Data", "Descrição", "Valor"],
      ["02/07/2026", "COMPRA", "-10,00"],
      ["", "Saldo final", "1.234,56"],
      ["Total", "", ""],
    ];
    const m = detectMapping(grid)!;
    const txs = rowsToTransactions(grid, m, "activo");
    expect(txs).toHaveLength(1);
  });

  it("deteta pelo conteúdo quando não há cabeçalho reconhecível", () => {
    const grid: Grid = [
      ["02/07/2026", "PAGAMENTO SERVICOS EDP", "-60,00"],
      ["03/07/2026", "COMPRA SUPERMERCADO PINGO DOCE", "-32,15"],
      ["04/07/2026", "LEVANTAMENTO MB", "-20,00"],
    ];
    const m = detectMapping(grid)!;
    expect(m.dateCol).toBe(0);
    expect(m.descriptionCol).toBe(1);
    expect(m.amountCol).toBe(2);

    const txs = rowsToTransactions(grid, m, "activo");
    expect(txs).toHaveLength(3);
    expect(txs[0]!.amountCents).toBe(6000);
  });

  // Cabeçalhos retirados dos extratos reais (Bankinter PT e export em inglês).
  it("extrato real PT: usa Montante e não a coluna Data Valor", () => {
    const grid: Grid = [
      ["Bankinter", "", "", "", "", "", "", "", ""],
      ["Nº de Conta à Ordem: 343 205772900 ( EUR)", "", "", "", "", "", "", "", ""],
      ["Movimentos no período: 03-07-2026 a 03-08-2026", "", "", "", "", "", "", "", ""],
      ["Data Movimento", "Data Valor", "Descrição", "Transacção", "Montante", "Moeda", "Saldo", "Taxa Câmbio", "Data Taxa Câmbio"],
      ["04-07-2026", "04-07-2026", "Trf Imediata p/ TIAGO - teste", "-", "-500.00", "EUR", "5691.97", "-", "-"],
      ["06-07-2026", "06-07-2026", "DD UNIVERSO-75355539854", "-", "-2970.20", "EUR", "2721.77", "-", "-"],
      ["06-07-2026", "06-07-2026", "Transf Imed de TIAGO", "-", "200.00", "EUR", "2921.77", "-", "-"],
    ];
    const m = detectMapping(grid)!;
    expect(m.dateCol).toBe(0);
    expect(m.descriptionCol).toBe(2);
    expect(m.amountCol).toBe(4); // Montante, NUNCA "Data Valor" nem "Saldo"
    expect(m.invertSign).toBe(true);

    const txs = rowsToTransactions(grid, m, "bankinter");
    expect(txs).toHaveLength(3);
    expect(txs[0]).toMatchObject({ transactionDate: "2026-07-04", amountCents: 50000 });
    expect(txs[1]!.amountCents).toBe(297020);
    // Entrada de dinheiro fica negativa (reduz o gasto).
    expect(txs[2]!.amountCents).toBe(-20000);
  });

  it("extrato real em inglês: usa Value e ignora Balance", () => {
    const grid: Grid = [
      ["HISTORY OF ACCOUNT NUMBER 45471361241", "", "", "", ""],
      ["Currency:", "EUR", "", "", ""],
      ["Date of:", "01/01/2026", "", "", ""],
      ["Launch Date", "Value Date", "Description", "Value", "Balance"],
      ["02/01/2026", "02/01/2026", "DD SOLINCA CLASSI 00051367764", "-55.99", "17.25"],
      ["05/01/2026", "04/01/2026", "TRF. P/O TIAGO ANDRE", "150.00", "166.25"],
    ];
    const m = detectMapping(grid)!;
    expect(m.dateCol).toBe(0);
    expect(m.descriptionCol).toBe(2);
    expect(m.amountCol).toBe(3); // Value, não Balance

    const txs = rowsToTransactions(grid, m, "activo");
    expect(txs).toHaveLength(2);
    expect(txs[0]).toMatchObject({ transactionDate: "2026-01-02", amountCents: 5599 });
    expect(txs[1]!.amountCents).toBe(-15000);
  });

  it("aceita o código da moeda colado ao valor", () => {
    expect(parseAmountCents("-156,00EUR")).toBe(-15600);
    expect(parseAmountCents("2.438,39EUR")).toBe(243839);
  });

  it("devolve null quando o ficheiro não tem nada aproveitável", () => {
    expect(detectMapping([["olá"], ["mundo"]])).toBeNull();
    expect(detectMapping([])).toBeNull();
  });

  it("mantém o mesmo UID para a mesma linha lida duas vezes (dedup estável)", () => {
    const grid: Grid = [
      ["Data", "Descrição", "Valor"],
      ["02/07/2026", "COMPRA  CONTINENTE ", "-45,20"],
    ];
    const m = detectMapping(grid)!;
    const a = rowsToTransactions(grid, m, "activo");
    const b = rowsToTransactions(grid, m, "activo");
    expect(a[0]).toEqual(b[0]);
  });
});

describe("headerFingerprint", () => {
  const bankinter: Grid = [
    ["Bankinter", "", ""],
    ["Data Movimento", "Data Valor", "Descrição", "Montante", "Saldo"],
    ["04-07-2026", "04-07-2026", "COMPRA", "-10.00", "100.00"],
  ];

  it("é igual para dois extratos do mesmo banco, com dados diferentes", () => {
    const outroMes: Grid = [
      ["Bankinter", "", ""],
      ["Data Movimento", "Data Valor", "Descrição", "Montante", "Saldo"],
      ["11-09-2026", "11-09-2026", "OUTRA COISA", "-99.00", "1.00"],
    ];
    expect(headerFingerprint(bankinter, 1)).toBe(headerFingerprint(outroMes, 1));
  });

  it("ignora maiúsculas e acentos nos nomes das colunas", () => {
    const semAcentos: Grid = [
      ["Bankinter", "", ""],
      ["DATA MOVIMENTO", "DATA VALOR", "DESCRICAO", "MONTANTE", "SALDO"],
    ];
    expect(headerFingerprint(semAcentos, 1)).toBe(headerFingerprint(bankinter, 1));
  });

  it("difere entre bancos com colunas diferentes", () => {
    const outroBanco: Grid = [["Launch Date", "Value Date", "Description", "Value", "Balance"]];
    expect(headerFingerprint(outroBanco, 0)).not.toBe(headerFingerprint(bankinter, 1));
  });

  it("devolve null quando o cabeçalho é pobre demais para identificar", () => {
    expect(headerFingerprint([["Data", "Valor"]], 0)).toBeNull();
    expect(headerFingerprint([], 0)).toBeNull();
  });
});

describe("detectDecimalSeparator", () => {
  /**
   * O caso que custou dinheiro: uma compra de 493,98 EUR importada como
   * 493 975,00 EUR, com o "500.00" da linha ao lado a ser lido bem.
   */
  it("um único 500.00 na coluna prova que o ponto é decimal", () => {
    expect(detectDecimalSeparator(["500.00", "555.36", "493.975"])).toBe(".");
  });

  it("um único 1234,56 prova que a vírgula é decimal", () => {
    expect(detectDecimalSeparator(["1.234,56", "2235,55"])).toBe(",");
  });

  it("não decide quando a coluna não diz nada", () => {
    expect(detectDecimalSeparator(["1000", "2000"])).toBeNull();
    expect(detectDecimalSeparator([])).toBeNull();
    // Os dois usados como decimal: o ficheiro é incoerente e não se adivinha.
    expect(detectDecimalSeparator(["1.50", "2,50"])).toBeNull();
  });
});

describe("parseAmountCents com o separador da coluna", () => {
  it("lê 493.975 como 493,975 quando o ponto é decimal", () => {
    expect(parseAmountCents("493.975", ".")).toBe(49398);
  });

  it("lê 493.975 como 493 975 quando a vírgula é decimal", () => {
    expect(parseAmountCents("493.975", ",")).toBe(49397500);
  });

  /**
   * Sem o separador da coluna, um número sozinho continua a ser lido pela regra
   * portuguesa — que é a certa quando não se sabe mais nada, e é exatamente a
   * que engana num ficheiro de decimais com ponto.
   */
  it("sem separador vale a regra de sempre", () => {
    expect(parseAmountCents("493.975")).toBe(49397500);
  });

  it("os milhares do outro sinal são ignorados", () => {
    expect(parseAmountCents("1,234.56", ".")).toBe(123456);
    expect(parseAmountCents("1.234,56", ",")).toBe(123456);
  });

  it("não estraga o que já estava certo", () => {
    expect(parseAmountCents("500.00", ".")).toBe(50000);
    expect(parseAmountCents("2235,55", ",")).toBe(223555);
    expect(parseAmountCents("-45,20", ",")).toBe(-4520);
  });
});
