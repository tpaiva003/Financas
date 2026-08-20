import { describe, expect, it } from "vitest";
import {
  TAXA_SEGURANCA_SOCIAL_PCT,
  liquidoDoBruto,
  origemPorExtenso,
} from "./bruto-liquido";

describe("liquidoDoBruto", () => {
  /** Números redondos e inventados: nada de ordenados reais, nem em teste. */
  it("desconta a Segurança Social e o IRS, ambos sobre o bruto", () => {
    const d = liquidoDoBruto({ brutoCents: 100_000, irsPct: 15 })!;
    expect(d.ssCents).toBe(11_000);
    expect(d.irsCents).toBe(15_000);
    expect(d.liquidoCents).toBe(74_000);
    expect(d.origem).toBe("recibo");
  });

  /**
   * Em cascata — IRS sobre o que sobra da Segurança Social — daria 75 350 em
   * vez de 74 000. O recibo aplica as duas ao bruto, e é o recibo que a pessoa
   * tem à frente para conferir.
   */
  it("não aplica as taxas em cascata", () => {
    const d = liquidoDoBruto({ brutoCents: 100_000, irsPct: 15 })!;
    expect(d.liquidoCents).not.toBe(100_000 - 11_000 - Math.round(89_000 * 0.15));
  });

  /**
   * Sem taxa de IRS não há resposta nenhuma. Descontar só a Segurança Social
   * daria um "líquido" maior do que o real — e um número grande de mais no
   * sítio do ordenado alimenta a taxa de poupança, o FIRE e tudo o que vem a
   * seguir.
   */
  it("recusa-se a calcular sem taxa de IRS", () => {
    expect(liquidoDoBruto({ brutoCents: 100_000, irsPct: null })).toBeNull();
  });

  it("recusa taxas impossíveis", () => {
    expect(liquidoDoBruto({ brutoCents: 100_000, irsPct: -1 })).toBeNull();
    expect(liquidoDoBruto({ brutoCents: 100_000, irsPct: 101 })).toBeNull();
    // As duas juntas não podem passar de tudo: daria um líquido negativo.
    expect(liquidoDoBruto({ brutoCents: 100_000, irsPct: 95, ssPct: 11 })).toBeNull();
  });

  it("recusa um bruto que não é um valor", () => {
    expect(liquidoDoBruto({ brutoCents: 0, irsPct: 15 })).toBeNull();
    expect(liquidoDoBruto({ brutoCents: -100, irsPct: 15 })).toBeNull();
    expect(liquidoDoBruto({ brutoCents: Number.NaN, irsPct: 15 })).toBeNull();
  });

  it("aceita outra taxa de Segurança Social sem deixar de ter uma normal", () => {
    expect(TAXA_SEGURANCA_SOCIAL_PCT).toBe(11);
    const d = liquidoDoBruto({ brutoCents: 100_000, irsPct: 10, ssPct: 0 })!;
    expect(d.ssCents).toBe(0);
    expect(d.liquidoCents).toBe(90_000);
  });

  /**
   * A conta não sabe de onde veio a taxa, e é isso que deixa as tabelas entrar
   * um dia sem lhe tocar.
   */
  it("carrega a origem da taxa sem a interpretar", () => {
    const d = liquidoDoBruto({ brutoCents: 100_000, irsPct: 15, origem: "tabela" })!;
    expect(d.origem).toBe("tabela");
    expect(d.liquidoCents).toBe(74_000);
  });

  it("uma taxa de zero é uma taxa, e não uma taxa em falta", () => {
    const d = liquidoDoBruto({ brutoCents: 100_000, irsPct: 0 })!;
    expect(d.irsCents).toBe(0);
    expect(d.liquidoCents).toBe(89_000);
  });
});

describe("origemPorExtenso", () => {
  it("diz de onde veio a taxa", () => {
    expect(origemPorExtenso("recibo")).toContain("recibo");
    expect(origemPorExtenso("tabela")).toContain("tabelas");
  });
});
