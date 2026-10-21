/**
 * Leitura de ficheiros Excel — com foco no sinal dos números.
 *
 * Estes testes existem por causa de uma venda importada como compra. A causa não
 * era o leitor de valores nem a deteção de colunas (ambos foram testados e
 * acertam): era este ficheiro a ler a célula **como o Excel a desenha**. O
 * formato "negativo a vermelho" mostra `-23` como `23`, e uma quantidade sem
 * sinal é uma compra.
 *
 * Os ficheiros são construídos aqui, com formatos reais do Excel. Nenhum
 * ficheiro do Tiago entra no repositório — são movimentos financeiros a sério e
 * isto é público.
 */

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readUploadToGrid } from "./read-file";
import { detectTradeMapping, rowsToTrades } from "./trades";

/** Um .xlsx de uma coluna só, com o formato de número indicado. */
function folhaComFormato(valor: number, formato?: string): File {
  const ws = XLSX.utils.aoa_to_sheet([["Quantidade"], [valor]]);
  if (formato) ws["A2"]!.z = formato;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Folha1");
  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new File([new Uint8Array(buf)], "teste.xlsx");
}

describe("o sinal negativo sobrevive ao formato do Excel", () => {
  const formatos: [string, string | undefined][] = [
    ["General", undefined],
    ["milhares simples", "#,##0"],
    ["negativo a vermelho, sem sinal", "#,##0;[Red]#,##0"],
    ["negativo entre parênteses", "#,##0;(#,##0)"],
    ["negativo a vermelho, com sinal", "#,##0.00;[Red]-#,##0.00"],
  ];

  for (const [nome, formato] of formatos) {
    it(`lê -23 como negativo com o formato "${nome}"`, async () => {
      const grid = await readUploadToGrid(folhaComFormato(-23, formato));
      const lido = Number(grid[1]![0]);
      expect(lido).toBe(-23);
    });
  }

  it("não estraga os positivos nem os decimais", async () => {
    expect(Number((await readUploadToGrid(folhaComFormato(7)))[1]![0])).toBe(7);
    expect(Number((await readUploadToGrid(folhaComFormato(13.98)))[1]![0])).toBe(13.98);
  });
});

describe("uma venda da corretora continua uma venda", () => {
  /** Cabeçalho no formato da Degiro, sem dados reais. */
  const CABECALHO = [
    "Data", "Hora", "Produto", "ISIN", "Bolsa de referência", "Bolsa",
    "Quantidade", "Preços", "", "Valor local", "", "Valor EUR",
    "Taxa de Câmbio", "Taxa Autofx", "Custos", "Total EUR", "ID da Ordem",
  ];

  /** Quantidade negativa e dinheiro a entrar: é uma venda. */
  const VENDA = [
    "09-12-2021", "17:30", "ACME OFFSHORE PARTNERS", "MH0000000000", "NDQ", "NDQ",
    -23, 13.98, "USD", 321.54, "USD", 284.6,
    1.1298, "", -0.5, 284.1, "ord-1",
  ];

  /** Quantidade positiva e dinheiro a sair: é uma compra. */
  const COMPRA = [
    "16-08-2021", "15:30", "ACME OFFSHORE PARTNERS", "MH0000000000", "NDQ", "NDQ",
    7, 18.6, "USD", -130.2, "USD", -110.8,
    1.1751, "", -0.5, -111.3, "ord-2",
  ];

  function ficheiro(formatoQuantidade: string | undefined): File {
    const ws = XLSX.utils.aoa_to_sheet([CABECALHO, VENDA, COMPRA]);
    if (formatoQuantidade) {
      ws["G2"]!.z = formatoQuantidade;
      ws["G3"]!.z = formatoQuantidade;
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new File([new Uint8Array(buf)], "Transactions.xlsx");
  }

  // O formato que dava o bug fica explicitamente na lista.
  for (const formato of [undefined, "#,##0", "#,##0;[Red]#,##0"]) {
    it(`a venda é lida como venda (formato: ${formato ?? "General"})`, async () => {
      const grid = await readUploadToGrid(ficheiro(formato));
      const mapping = detectTradeMapping(grid);
      expect(mapping).not.toBeNull();

      const movimentos = rowsToTrades(grid, mapping!);
      expect(movimentos).toHaveLength(2);
      expect(movimentos[0]!.kind).toBe("venda");
      expect(movimentos[0]!.quantity).toBe(23);
      expect(movimentos[1]!.kind).toBe("compra");
      expect(movimentos[1]!.quantity).toBe(7);
    });
  }

  it("a moeda e o câmbio sobrevivem à leitura", async () => {
    const grid = await readUploadToGrid(ficheiro(undefined));
    const movimentos = rowsToTrades(grid, detectTradeMapping(grid)!);
    expect(movimentos[0]!.currency).toBe("USD");
    expect(movimentos[0]!.fxRate).toBeCloseTo(1.1298, 4);
  });
});
