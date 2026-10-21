import { describe, expect, it } from "vitest";
import { dominioValido, gestoraDoNome } from "./marcas";

describe("gestoraDoNome", () => {
  it("apanha a gestora nos nomes como as corretoras os escrevem", () => {
    expect(gestoraDoNome("ISHARES CORE MSCI WORLD UCITS ETF USD (ACC)")).toBe("ishares.com");
    expect(gestoraDoNome("Vanguard FTSE All-World UCITS ETF")).toBe("vanguard.com");
    expect(gestoraDoNome("XTRACKERS MSCI EUROPE")).toBe("xtrackers.com");
  });

  /**
   * Um ETF da iShares sobre a Apple é da iShares, não da Apple. Pôr o logo da
   * Apple num fundo de índice seria dizer uma coisa falsa sobre o que se tem.
   */
  it("a gestora ganha ao que o índice segue", () => {
    expect(gestoraDoNome("ISHARES S&P 500 UCITS ETF")).toBe("ishares.com");
  });

  it("não adivinha quando o nome não diz", () => {
    expect(gestoraDoNome("KNOT OFFSHORE PARTNERS")).toBeNull();
    expect(gestoraDoNome("")).toBeNull();
  });
});

describe("dominioValido", () => {
  it("aceita um domínio normal, com ou sem www", () => {
    expect(dominioValido("apple.com")).toBe("apple.com");
    expect(dominioValido("www.Apple.com")).toBe("apple.com");
    expect(dominioValido("ishares.com ")).toBe("ishares.com");
    expect(dominioValido("bpi.pt")).toBe("bpi.pt");
  });

  /**
   * Este valor vai parar dentro de um endereço que o SERVIDOR vai buscar. Com
   * barras lá dentro escolhe o caminho; com um `@`, escolhe o servidor. A
   * validação tem de estar aqui e não no sítio onde o URL é montado.
   */
  it("recusa tudo o que possa mudar o endereço de destino", () => {
    expect(dominioValido("apple.com/../admin")).toBeNull();
    expect(dominioValido("https://apple.com")).toBeNull();
    expect(dominioValido("apple.com@evil.example")).toBeNull();
    expect(dominioValido("apple.com:8080")).toBeNull();
    expect(dominioValido("localhost")).toBeNull();
    expect(dominioValido("169.254.169.254")).toBeNull();
    expect(dominioValido("")).toBeNull();
  });

  it("recusa etiquetas malformadas", () => {
    expect(dominioValido("-apple.com")).toBeNull();
    expect(dominioValido("apple-.com")).toBeNull();
    expect(dominioValido("apple.c")).toBeNull();
  });
});
