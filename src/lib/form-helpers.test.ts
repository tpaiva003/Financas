import { describe, expect, it } from "vitest";
import { normalizeAmount, parseAmountCents, porqueNaoGravou } from "./form-helpers";

describe("normalizeAmount", () => {
  /**
   * "1.234,56" e "1,234.56" querem dizer o mesmo em sítios diferentes. Quem
   * escreve à portuguesa e quem cola de um extrato inglês têm de chegar ao
   * mesmo número.
   */
  it("percebe o formato português e o inglês", () => {
    expect(normalizeAmount("1.234,56")).toBe("1234.56");
    expect(normalizeAmount("1,234.56")).toBe("1234.56");
  });

  it("com um separador só, a vírgula é decimal", () => {
    expect(normalizeAmount("12,50")).toBe("12.50");
    // "1,5" são um e meio, não mil e quinhentos.
    expect(normalizeAmount("1,5")).toBe("1.5");
  });

  /**
   * O que vem por último é o decimal.
   *
   * A versão anterior assumia sempre "ponto = milhares", o que acerta no
   * formato português e falha no inglês — que é o que sai de meia dúzia de
   * extratos. "1,234.56" devolvia 1,23456: **mil vezes menos**, com o ar de um
   * número perfeitamente normal, e ia direto para o valor de uma despesa.
   */
  it("o separador que vem por último é o decimal", () => {
    expect(normalizeAmount("1.234,56")).toBe("1234.56");
    expect(normalizeAmount("1,234.56")).toBe("1234.56");
    expect(normalizeAmount("1.234.567,89")).toBe("1234567.89");
    expect(normalizeAmount("1,234,567.89")).toBe("1234567.89");
  });

  it("deixa passar o que não é texto", () => {
    expect(normalizeAmount(42)).toBe(42);
    expect(normalizeAmount(null)).toBeNull();
  });

  it("tira os espaços, incluindo os que separam milhares", () => {
    expect(normalizeAmount(" 1 234,5 ")).toBe("1234.5");
  });
});

describe("parseAmountCents", () => {
  it("converte para cêntimos", () => {
    expect(parseAmountCents("12,50")).toBe(1250);
    expect(parseAmountCents("1.234,56")).toBe(123456);
  });

  /**
   * Vazio e inválido são coisas diferentes, e quem chama precisa de as
   * distinguir: um campo vazio pode ser opcional, um campo com lixo nunca é.
   */
  it("vazio é nulo, lixo é NaN", () => {
    expect(parseAmountCents("")).toBeNull();
    expect(parseAmountCents(null)).toBeNull();
    expect(Number.isNaN(parseAmountCents("abc"))).toBe(true);
    expect(Number.isNaN(parseAmountCents("0"))).toBe(true);
    expect(Number.isNaN(parseAmountCents("-5"))).toBe(true);
  });
});

describe("porqueNaoGravou", () => {
  /**
   * "Não consegui gravar" é verdade e não serve para nada: não distingue uma
   * migração por correr de um número que a coluna não aceita, e obriga a
   * adivinhar em rondas.
   */
  it("aponta a coluna que falta, com o que fazer", () => {
    const msg = porqueNaoGravou(new Error(`column "sector" of relation "assets" does not exist`));
    expect(msg).toContain("sector");
    expect(msg).toContain("migração");
  });

  it("reconhece uma tabela que ainda não existe", () => {
    const msg = porqueNaoGravou(new Error('relation "valuations" does not exist'));
    expect(msg).toContain("tabela");
    expect(msg).toContain("migrações");
  });

  it("leva o motivo em cru quando não reconhece o padrão", () => {
    expect(porqueNaoGravou(new Error("ligação recusada"), "o bem")).toContain("ligação recusada");
  });

  it("não rebenta com o que não é um erro", () => {
    expect(porqueNaoGravou(null, "isto")).toContain("Não consegui gravar");
    expect(porqueNaoGravou(undefined)).toContain("Não consegui gravar");
  });
});
