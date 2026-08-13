import { describe, expect, it } from "vitest";
import { duplicadosDeAtivos, duplicadosPorExtenso } from "./duplicados";

const bem = (id: string, name: string, symbol: string | null, extra = {}) => ({
  id,
  name,
  symbol,
  ...extra,
});

const contagem = (pares: Record<string, number>) => new Map(Object.entries(pares));

describe("duplicadosDeAtivos", () => {
  /**
   * O caso real: a mesma corretora escreve "ADR ON UNILEVER" num extrato e
   * "ADR ON UNILEVER PLC" no seguinte. Nenhum dos dois está errado — o que está
   * errado é serem dois.
   */
  it("junta dois registos com o mesmo símbolo, apesar dos nomes diferentes", () => {
    const g = duplicadosDeAtivos(
      [bem("a", "ADR ON UNILEVER", "ul.us"), bem("b", "ADR ON UNILEVER PLC", "ul.us")],
      contagem({ a: 3, b: 1 }),
    );
    expect(g).toHaveLength(1);
    expect(g[0]!.simbolo).toBe("ul.us");
    expect(g[0]!.membros.map((m) => m.ativo.id)).toEqual(["a", "b"]);
  });

  /**
   * A decisão que manda neste módulo. Nomes quase iguais e coisas diferentes:
   * uma negoceia e a outra não. Juntá-las apagava uma distinção que alguém teve
   * o trabalho de fazer — e parecença de nomes é um palpite sobre dinheiro.
   */
  it("nunca junta pelo nome", () => {
    expect(
      duplicadosDeAtivos(
        [
          bem("a", "XPHYTO THERAPEUTICS", null),
          bem("b", "XPHYTO THERAPEUTICS - NON TRADEABLE", null),
        ],
        contagem({}),
      ),
    ).toEqual([]);

    // Nem sequer com nomes exactamente iguais, se os símbolos diferirem.
    expect(
      duplicadosDeAtivos(
        [bem("a", "Igual", "aaa.us"), bem("b", "Igual", "bbb.us")],
        contagem({}),
      ),
    ).toEqual([]);
  });

  it("ignora quem não tem símbolo, e não os junta uns aos outros", () => {
    expect(
      duplicadosDeAtivos([bem("a", "Um", null), bem("b", "Outro", null)], contagem({})),
    ).toEqual([]);
  });

  it("não acusa um investimento que está sozinho", () => {
    expect(duplicadosDeAtivos([bem("a", "Só um", "msft.us")], contagem({ a: 9 }))).toEqual([]);
  });

  it("compara símbolos sem olhar a maiúsculas nem a espaços", () => {
    const g = duplicadosDeAtivos(
      [bem("a", "Um", "TEN.US"), bem("b", "Outro", " ten.us ")],
      contagem({}),
    );
    expect(g).toHaveLength(1);
  });

  describe("qual é que sugere manter", () => {
    it("o que tem mais movimentos, porque é o que menos custa manter", () => {
      const g = duplicadosDeAtivos(
        [bem("pobre", "A", "ten.us"), bem("rico", "B", "ten.us")],
        contagem({ pobre: 1, rico: 12 }),
      );
      expect(g[0]!.sugeridoId).toBe("rico");
    });

    it("com movimentos empatados, o mais completo", () => {
      // O logo e a bolsa do outro perdem-se na fusão; não vale a pena escolher
      // a versão pobre por acaso.
      const g = duplicadosDeAtivos(
        [
          bem("nu", "A", "pltr.us"),
          bem("vestido", "B", "pltr.us", { logoDomain: "palantir.com", exchange: "NASDAQ" }),
        ],
        contagem({ nu: 2, vestido: 2 }),
      );
      expect(g[0]!.sugeridoId).toBe("vestido");
    });

    it("empatado tudo, o mais antigo", () => {
      const g = duplicadosDeAtivos(
        [
          bem("novo", "A", "tsat.us", { createdAt: "2026-08-10T00:00:00Z" }),
          bem("velho", "B", "tsat.us", { createdAt: "2024-01-01T00:00:00Z" }),
        ],
        contagem({ novo: 2, velho: 2 }),
      );
      expect(g[0]!.sugeridoId).toBe("velho");
    });

    it("a ordem não depende da sorte da consulta", () => {
      const bens = [bem("z", "A", "x.us"), bem("a", "B", "x.us")];
      const um = duplicadosDeAtivos(bens, contagem({}));
      const outro = duplicadosDeAtivos([...bens].reverse(), contagem({}));
      expect(um[0]!.sugeridoId).toBe(outro[0]!.sugeridoId);
    });
  });

  it("põe à frente os grupos com mais registos a juntar", () => {
    const g = duplicadosDeAtivos(
      [
        bem("a1", "A", "aaa.us"),
        bem("a2", "A", "aaa.us"),
        bem("b1", "B", "bbb.us"),
        bem("b2", "B", "bbb.us"),
        bem("b3", "B", "bbb.us"),
      ],
      contagem({}),
    );
    expect(g.map((x) => x.simbolo)).toEqual(["bbb.us", "aaa.us"]);
  });
});

describe("duplicadosPorExtenso", () => {
  it("cala-se quando não há nada", () => {
    expect(duplicadosPorExtenso([])).toBeNull();
  });

  it("conta os registos a mais, e não os grupos", () => {
    const g = duplicadosDeAtivos(
      [
        bem("a1", "A", "aaa.us"),
        bem("a2", "A", "aaa.us"),
        bem("b1", "B", "bbb.us"),
        bem("b2", "B", "bbb.us"),
      ],
      contagem({}),
    );
    // Quatro registos para dois investimentos: dois a mais.
    expect(duplicadosPorExtenso(g)).toContain("2 a mais");
  });
});
