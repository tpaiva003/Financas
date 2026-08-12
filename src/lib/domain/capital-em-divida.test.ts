import { describe, expect, it } from "vitest";
import { capitalEmDividaEm } from "./capital-em-divida";
import { prestacaoAnuidadeCents } from "./credito";

/** Um crédito à habitação inventado, com números redondos. */
const FIXA = [{ startsOn: "2020-01-01", kind: "fixa" as const, ratePct: 3 }];

const base = {
  principalCents: 200_000_00,
  contractStart: "2020-01-01",
  maturityDate: "2050-01-01",
  periods: FIXA,
  indexanteRates: {},
};

function ok(r: ReturnType<typeof capitalEmDividaEm>) {
  if ("erro" in r) throw new Error(r.erro);
  return r.ok;
}

describe("capitalEmDividaEm", () => {
  it("no dia da escritura deve-se tudo o que se pediu", () => {
    const r = ok(capitalEmDividaEm({ ...base, atDate: "2020-01-01" }));
    expect(r.balanceCents).toBe(200_000_00);
    expect(r.mesesPagos).toBe(0);
    expect(r.amortizadoCents).toBe(0);
  });

  it("a prestação do primeiro mês é a da anuidade sobre o prazo todo", () => {
    const r = ok(capitalEmDividaEm({ ...base, atDate: "2020-02-01" }));
    // 200 000 € a 3% em 360 meses.
    expect(r.prestacaoCents).toBe(prestacaoAnuidadeCents(200_000_00, 3, 360));
  });

  /**
   * O que este módulo existe para fazer: o número que ninguém tem de cabeça.
   * Ao fim de dez anos de trinta, num crédito a 3%, ainda se deve bem mais de
   * dois terços — porque no princípio quase tudo o que se paga são juros.
   */
  it("ao fim de dez anos falta muito mais do que dois terços", () => {
    const r = ok(capitalEmDividaEm({ ...base, atDate: "2030-01-01" }));
    expect(r.mesesPagos).toBe(120);
    expect(r.balanceCents).toBeGreaterThan(150_000_00);
    expect(r.balanceCents).toBeLessThan(160_000_00);
    // E já se pagaram mais juros do que capital.
    expect(r.jurosPagosCents).toBeGreaterThan(r.amortizadoCents);
  });

  it("no fim do prazo está pago, e não fica dívida inventada", () => {
    const r = ok(capitalEmDividaEm({ ...base, atDate: "2050-01-01" }));
    expect(r.balanceCents).toBe(0);
  });

  it("depois do fim do prazo continua pago", () => {
    // Sem o limite ao prazo, os meses a mais continuavam a "pagar" e o saldo
    // ficava negativo — dívida ao contrário.
    const r = ok(capitalEmDividaEm({ ...base, atDate: "2055-01-01" }));
    expect(r.balanceCents).toBe(0);
  });

  it("o que se amortizou mais o que falta dá o que se pediu", () => {
    const r = ok(capitalEmDividaEm({ ...base, atDate: "2033-06-01" }));
    expect(r.amortizadoCents + r.balanceCents).toBe(200_000_00);
  });

  /**
   * Num crédito de taxa mista a prestação é recalculada quando a taxa muda. Usar
   * a primeira até ao fim dava o saldo de outro crédito.
   */
  it("a mudança de taxa recalcula a prestação, e isso muda o saldo", () => {
    const mista = [
      { startsOn: "2020-01-01", kind: "fixa" as const, ratePct: 2 },
      { startsOn: "2025-01-01", kind: "variavel" as const, indexante: "euribor6m" as const, spreadPct: 1 },
    ];
    const comSubida = capitalEmDividaEm({
      ...base,
      periods: mista,
      indexanteRates: { euribor6m: 4 },
      atDate: "2030-01-01",
    });
    const semSubida = capitalEmDividaEm({
      ...base,
      periods: mista,
      indexanteRates: { euribor6m: 0 },
      atDate: "2030-01-01",
    });
    // Com juros mais altos amortiza-se menos: fica mais por pagar.
    expect(ok(comSubida).balanceCents).toBeGreaterThan(ok(semSubida).balanceCents);
  });

  it("a taxa de um período que ainda não começou não conta", () => {
    const mista = [
      { startsOn: "2020-01-01", kind: "fixa" as const, ratePct: 2 },
      { startsOn: "2040-01-01", kind: "fixa" as const, ratePct: 9 },
    ];
    const so2anos = ok(capitalEmDividaEm({ ...base, periods: mista, atDate: "2022-01-01" }));
    const soFixa = ok(
      capitalEmDividaEm({
        ...base,
        periods: [{ startsOn: "2020-01-01", kind: "fixa", ratePct: 2 }],
        atDate: "2022-01-01",
      }),
    );
    expect(so2anos.balanceCents).toBe(soFixa.balanceCents);
  });
});

describe("capitalEmDividaEm — o que se recusa a calcular", () => {
  /**
   * Um capital em dívida errado propaga-se ao património líquido inteiro, e um
   * zero silencioso lê-se como um crédito pago.
   */
  it("recusa sem montante contratado", () => {
    expect("erro" in capitalEmDividaEm({ ...base, principalCents: 0, atDate: "2030-01-01" })).toBe(true);
  });

  it("recusa sem datas", () => {
    expect("erro" in capitalEmDividaEm({ ...base, contractStart: "", atDate: "2030-01-01" })).toBe(true);
    expect("erro" in capitalEmDividaEm({ ...base, maturityDate: "logo", atDate: "2030-01-01" })).toBe(true);
  });

  it("recusa uma maturidade anterior ao início", () => {
    const r = capitalEmDividaEm({ ...base, maturityDate: "2019-01-01", atDate: "2030-01-01" });
    expect("erro" in r && r.erro).toContain("anterior");
  });

  it("recusa sem períodos de taxa", () => {
    expect("erro" in capitalEmDividaEm({ ...base, periods: [], atDate: "2030-01-01" })).toBe(true);
  });

  /**
   * Sem o valor do indexante não há taxa, e sem taxa não há amortização. Chutar
   * um valor daria um saldo com ar de conta feita.
   */
  it("recusa quando falta o valor do indexante", () => {
    const r = capitalEmDividaEm({
      ...base,
      periods: [{ startsOn: "2020-01-01", kind: "variavel", indexante: "euribor6m", spreadPct: 1 }],
      indexanteRates: {},
      atDate: "2030-01-01",
    });
    expect("erro" in r && r.erro).toContain("indexante");
  });
});
