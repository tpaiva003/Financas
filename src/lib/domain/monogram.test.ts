import { describe, expect, it } from "vitest";
import { monogramFor } from "./monogram";

describe("monogramFor", () => {
  it("do ticker tira as duas primeiras letras", () => {
    expect(monogramFor("aapl.us", "Apple Inc.").letters).toBe("AA");
    expect(monogramFor("vwce.de", "Vanguard FTSE All-World").letters).toBe("VW");
  });

  it("ignora o sufixo de praça e o acento circunflexo dos índices", () => {
    expect(monogramFor("^spx", "S&P 500").letters).toBe("SP");
  });

  it("sem ticker, usa as iniciais das palavras do nome", () => {
    expect(monogramFor(null, "Knot Offshore Partners").letters).toBe("KO");
    expect(monogramFor("", "Banco Comercial Português").letters).toBe("BC");
  });

  it("salta as palavras de ligação", () => {
    expect(monogramFor(null, "Banco de Investimento").letters).toBe("BI");
  });

  it("aguenta o que não tem letras nenhumas", () => {
    expect(monogramFor(null, "").letters).toBe("?");
    expect(monogramFor(null, "   ").letters).toBe("?");
  });

  // É isto que faz o emblema valer alguma coisa: a mesma ação tem sempre a
  // mesma cor, por isso a carteira reconhece-se de relance sem se ler o texto.
  it("a cor é sempre a mesma para o mesmo símbolo", () => {
    expect(monogramFor("aapl.us", "Apple").hue).toBe(monogramFor("aapl.us", "Outro nome").hue);
  });

  it("símbolos diferentes não caem todos na mesma cor", () => {
    const tons = new Set(
      ["aapl.us", "msft.us", "vwce.de", "knop.us", "bcp.pt", "tsla.us"].map(
        (s) => monogramFor(s, s).hue,
      ),
    );
    expect(tons.size).toBeGreaterThan(3);
  });

  it("a matiz está sempre no intervalo válido", () => {
    for (const s of ["a", "aapl.us", "um nome muito comprido de um ETF qualquer", "^spx"]) {
      const { hue } = monogramFor(s, s);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});
