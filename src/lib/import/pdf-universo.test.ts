import { describe, it, expect } from "vitest";
import { universoLinesToGrid, findPeriod, resolveYear } from "./pdf-universo";
import { detectMapping, rowsToTransactions } from "./columns";

// Linhas retiradas de um extrato real do Universo.
const REAL_LINES = [
  "EXTRATO MOVIMENTOS - CONTA CRÉDITO",
  "Movimentos de: 15/06/2026 a 15/07/2026",
  "Data",
  "Realização",
  "Saldo em dívida (à data de fecho do extrato anterior)-2.970,20 €",
  "Movimentos neste período:",
  "0,00 €-1.087,36 €",
  "16/0616/06 Compra Restaurante Abaco Porto FIM DO MES0,00 €-9,82 €",
  "17/0617/06 Compra Clinica Vet Valongo Valongo FIM DO MES0,00 €-179,33 €",
  "28/0628/06 Compra Na Internet Google One Dublin FIM DO MES0,00 €-21,99 €",
  "01/0701/07 Debito Direto Logo 87762031012 FIM DO MES0,00 €-5,00 €",
  "04/0704/07 Compra Poke House Norteshop Porto FIM DO MES0,00 €-13,00 €",
  "www.universo.pt",
  "Apoio ao Cliente 308 811 418",
];

describe("extrato Universo (PDF)", () => {
  it("lê o período do extrato", () => {
    expect(findPeriod(REAL_LINES)).toMatchObject({
      start: "2026-06-15",
      end: "2026-07-15",
      startYear: 2026,
      endYear: 2026,
    });
  });

  it("converte movimentos e ignora saldos, totais e rodapés", () => {
    const grid = universoLinesToGrid(REAL_LINES);
    expect(grid[0]).toEqual(["Data", "Descrição", "Valor"]);
    expect(grid).toHaveLength(6); // cabeçalho + 5 movimentos
    expect(grid[1]).toEqual(["2026-06-16", "Compra Restaurante Abaco Porto", "-9,82"]);
    expect(grid[5]).toEqual(["2026-07-04", "Compra Poke House Norteshop Porto", "-13,00"]);
  });

  it("tira a modalidade de pagamento da descrição", () => {
    const grid = universoLinesToGrid(REAL_LINES);
    expect(grid.every((r, i) => i === 0 || !/FIM DO MES/i.test(r[1]!))).toBe(true);
  });

  it("deduz o ano correto quando o extrato vira o ano", () => {
    const period = { start: "2025-12-15", end: "2026-01-15", startYear: 2025, endYear: 2026 };
    expect(resolveYear(20, 12, period)).toBe(2025);
    expect(resolveYear(5, 1, period)).toBe(2026);
  });

  it("dá uma grelha que o pipeline normal consegue importar", () => {
    const grid = universoLinesToGrid(REAL_LINES);
    const mapping = detectMapping(grid)!;
    expect(mapping.amountCol).toBe(2);

    const txs = rowsToTransactions(grid, mapping, "universo");
    expect(txs).toHaveLength(5);
    // Compras são gastos: ficam positivos.
    expect(txs[0]).toMatchObject({
      transactionDate: "2026-06-16",
      amountCents: 982,
      description: "Compra Restaurante Abaco Porto",
    });
    expect(txs[1]!.amountCents).toBe(17933);
  });

  it("lê linhas sem espaço entre a data e a descrição", () => {
    // Formato encontrado noutro extrato real: "15/0516/05Compra ..." (sem espaço).
    const grid = universoLinesToGrid([
      "Movimentos de: 15/05/2026 a 15/06/2026",
      "15/0516/05Compra Na Internet Temu.com Dublin 2 FIM DO MES0,00 €-11,62 €",
      "15/0516/05Compra Ori Gin Porto FIM DO MES0,00 €-14,10 €",
    ]);
    expect(grid).toHaveLength(3);
    expect(grid[1]).toEqual(["2026-05-15", "Compra Na Internet Temu.com Dublin 2", "-11,62"]);
    expect(grid[2]).toEqual(["2026-05-15", "Compra Ori Gin Porto", "-14,10"]);
  });

  it("devolve vazio quando não há período (PDF que não é um extrato)", () => {
    expect(universoLinesToGrid(["qualquer coisa", "sem período"])).toEqual([]);
  });
});
