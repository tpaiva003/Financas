import { describe, expect, it } from "vitest";
import { formatForeignCents, formatRate, fromEurCents, impliedRate, isForeign, toEurCents } from "./fx";

describe("isForeign", () => {
  it("o euro não é moeda estrangeira", () => {
    expect(isForeign("EUR")).toBe(false);
    expect(isForeign(null)).toBe(false);
    expect(isForeign(undefined)).toBe(false);
    expect(isForeign("USD")).toBe(true);
  });
});

describe("toEurCents", () => {
  it("divide pela taxa, que vem em moeda estrangeira por euro", () => {
    // 1.090 USD a 1,09 USD por EUR dá 1.000 EUR.
    expect(toEurCents(109_000, 1.09)).toBe(100_000);
  });

  it("recusa taxas impossíveis em vez de devolver um número errado", () => {
    expect(toEurCents(100_000, 0)).toBeNull();
    expect(toEurCents(100_000, -1)).toBeNull();
    expect(toEurCents(100_000, Number.NaN)).toBeNull();
  });
});

describe("fromEurCents", () => {
  it("faz o caminho inverso", () => {
    expect(fromEurCents(100_000, 1.09)).toBe(109_000);
  });

  it("ida e volta não perde mais do que o arredondamento", () => {
    const eur = toEurCents(123_456, 1.0912)!;
    const back = fromEurCents(eur, 1.0912)!;
    expect(Math.abs(back - 123_456)).toBeLessThanOrEqual(2);
  });
});

describe("impliedRate", () => {
  it("deriva a taxa dos dois valores da nota da corretora", () => {
    expect(impliedRate(109_000, 100_000)).toBeCloseTo(1.09, 6);
  });

  it("não inventa taxa sem valores", () => {
    expect(impliedRate(0, 100_000)).toBeNull();
    expect(impliedRate(109_000, 0)).toBeNull();
  });
});

describe("formatRate", () => {
  it("escreve à portuguesa com quatro casas", () => {
    expect(formatRate(1.0912)).toBe("1,0912");
  });
});

describe("formatForeignCents", () => {
  it("mostra o valor como a bolsa o cota", () => {
    // O número que a pessoa vê no telemóvel quando abre a AAPL.
    expect(formatForeignCents(27010, "USD")).toBe("270,10 USD");
  });

  it("usa a vírgula decimal portuguesa, como o resto da app", () => {
    expect(formatForeignCents(49529, "USD")).toBe("495,29 USD");
  });

  it("separa os milhares para um preço alto se poder ler", () => {
    // Uma ação a cinco dígitos sem separador lê-se mal e confere-se pior.
    expect(formatForeignCents(1234567, "USD")).toMatch(/^12.345,67 USD$/);
  });

  it("mantém as duas casas mesmo num valor redondo", () => {
    expect(formatForeignCents(27000, "GBP")).toBe("270,00 GBP");
  });

  it("põe o código em maiúsculas venha ele como vier", () => {
    expect(formatForeignCents(100, "usd")).toBe("1,00 USD");
  });

  it("usa o código de três letras e não o símbolo", () => {
    // O "$" é ambíguo entre meia dúzia de moedas, e num sítio onde se somam
    // valores isso não pode ficar ao critério de quem lê.
    expect(formatForeignCents(27010, "CAD")).toBe("270,10 CAD");
    expect(formatForeignCents(27010, "AUD")).toBe("270,10 AUD");
  });
});
