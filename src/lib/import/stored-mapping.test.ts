import { describe, expect, it } from "vitest";
import { storedHoldingMapping, storedTradeMapping } from "./stored-mapping";
import type { Grid } from "./columns";

const GRELHA: Grid = [
  ["Data", "Produto", "Quantidade", "Preço", "Valor", "Moeda", "Câmbio", "Tipo"],
  ["2026-01-02", "ACME", "10", "5,00", "50,00", "USD", "1,09", "compra"],
];

/** Um template completo, como a app o grava hoje. */
const COMPLETO = {
  headerRow: 0,
  dateCol: 0,
  nameCol: 1,
  quantityCol: 2,
  priceCol: 3,
  amountCol: 4,
  currencyCol: 5,
  fxRateCol: 6,
  kindCol: 7,
};

describe("storedTradeMapping", () => {
  it("aceita um template completo", () => {
    expect(storedTradeMapping(COMPLETO, GRELHA)).toEqual(COMPLETO);
  });

  it("aceita -1 nas colunas que o ficheiro não tem", () => {
    const m = storedTradeMapping({ ...COMPLETO, kindCol: -1, fxRateCol: -1 }, GRELHA);
    expect(m?.kindCol).toBe(-1);
    expect(m?.fxRateCol).toBe(-1);
  });

  // O caso que motivou tudo isto: um template gravado por uma versão da app que
  // ainda não conhecia a moeda nem o câmbio. Os campos chegavam como undefined,
  // `undefined >= 0` é false, e a app lia isso como "este ficheiro não tem
  // moeda" — gravando dólares como euros, sem um aviso.
  it("recusa um template a que falte a moeda", () => {
    const { currencyCol: _omitido, ...velho } = COMPLETO;
    expect(storedTradeMapping(velho, GRELHA)).toBeNull();
  });

  it("recusa um template a que falte o câmbio", () => {
    const { fxRateCol: _omitido, ...velho } = COMPLETO;
    expect(storedTradeMapping(velho, GRELHA)).toBeNull();
  });

  it("recusa um template sem as colunas essenciais", () => {
    expect(storedTradeMapping({ ...COMPLETO, dateCol: -1 }, GRELHA)).toBeNull();
    expect(storedTradeMapping({ ...COMPLETO, nameCol: -1 }, GRELHA)).toBeNull();
    expect(storedTradeMapping({ ...COMPLETO, quantityCol: -1 }, GRELHA)).toBeNull();
  });

  it("recusa índices fora da grelha do ficheiro", () => {
    expect(storedTradeMapping({ ...COMPLETO, quantityCol: 99 }, GRELHA)).toBeNull();
    expect(storedTradeMapping({ ...COMPLETO, headerRow: 5 }, GRELHA)).toBeNull();
  });

  it("recusa valores que não são inteiros", () => {
    expect(storedTradeMapping({ ...COMPLETO, priceCol: 1.5 }, GRELHA)).toBeNull();
    expect(storedTradeMapping({ ...COMPLETO, kindCol: true }, GRELHA)).toBeNull();
  });

  it("recusa o que não existe", () => {
    expect(storedTradeMapping(null, GRELHA)).toBeNull();
    expect(storedTradeMapping(undefined, GRELHA)).toBeNull();
    expect(storedTradeMapping({}, GRELHA)).toBeNull();
  });
});

describe("storedHoldingMapping", () => {
  const POSICOES = {
    headerRow: 0,
    nameCol: 1,
    quantityCol: 2,
    unitCostCol: 3,
    unitPriceCol: 4,
    marketValueCol: -1,
  };

  it("aceita um template de posições completo", () => {
    expect(storedHoldingMapping(POSICOES, GRELHA)).toEqual(POSICOES);
  });

  it("não confunde um template de movimentos com um de posições", () => {
    expect(storedHoldingMapping(COMPLETO, GRELHA)).toBeNull();
  });

  it("recusa um template de posições incompleto", () => {
    const { unitCostCol: _omitido, ...velho } = POSICOES;
    expect(storedHoldingMapping(velho, GRELHA)).toBeNull();
  });
});
