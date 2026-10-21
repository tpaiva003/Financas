import { describe, expect, it } from "vitest";
import { FONTES_DE_LOGO, pareceIcone, urlsDoLogo } from "./logos";

describe("urlsDoLogo", () => {
  /**
   * A razão de isto existir. Com uma fonte só, um serviço gratuito que passe a
   * responder 404 apaga todos os logos ao mesmo tempo — e o que se vê é uma
   * carteira que tinha logos e deixou de ter, que se lê como perda de dados.
   */
  it("dá mais do que uma fonte", () => {
    expect(urlsDoLogo("edp.com").length).toBeGreaterThan(1);
  });

  it("todas apontam ao domínio pedido", () => {
    for (const url of urlsDoLogo("nvidia.com")) {
      expect(url).toContain("nvidia.com");
      expect(url.startsWith("https://")).toBe(true);
    }
  });

  it("a última é o próprio site, que é a que conta menos a terceiros", () => {
    const urls = urlsDoLogo("edp.com");
    expect(urls[urls.length - 1]).toBe("https://edp.com/favicon.ico");
  });

  it("não há duas fontes com o mesmo endereço", () => {
    const urls = urlsDoLogo("meta.com");
    expect(new Set(urls).size).toBe(urls.length);
    expect(new Set(FONTES_DE_LOGO.map((f) => f.id)).size).toBe(FONTES_DE_LOGO.length);
  });
});

describe("pareceIcone", () => {
  const LIMITE = 512 * 1024;

  it("aceita uma imagem de tamanho normal", () => {
    expect(pareceIcone("image/png", 4_000, LIMITE)).toBe(true);
  });

  /**
   * Vários serviços respondem 200 com um GIF transparente de 1×1 quando não
   * conhecem o domínio — um "não sei" disfarçado de sucesso. Aceitá-lo gastava
   * a primeira fonte e desenhava um quadrado vazio onde o monograma teria dito
   * alguma coisa; e como responde 200, nunca se passava à fonte seguinte.
   */
  it("recusa o pixel transparente que finge ser resposta", () => {
    expect(pareceIcone("image/gif", 43, LIMITE)).toBe(false);
    expect(pareceIcone("image/png", 68, LIMITE)).toBe(false);
  });

  it("recusa HTML devolvido com 200", () => {
    // Um `<img>` que recebe HTML mostra o ícone partido em vez de cair no recuo.
    expect(pareceIcone("text/html; charset=utf-8", 9_000, LIMITE)).toBe(false);
    expect(pareceIcone(null, 9_000, LIMITE)).toBe(false);
  });

  it("recusa o que é grande de mais para ser um ícone", () => {
    expect(pareceIcone("image/png", LIMITE + 1, LIMITE)).toBe(false);
  });

  it("recusa uma resposta vazia", () => {
    expect(pareceIcone("image/png", 0, LIMITE)).toBe(false);
  });
});
