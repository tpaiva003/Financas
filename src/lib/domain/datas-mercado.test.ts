import { describe, expect, it } from "vitest";
import {
  datasAProximar,
  precisaDeDatas,
  quandoPorExtenso,
  type InvestimentoComDatas,
} from "./datas-mercado";

const HOJE = "2026-08-12";

const acao = (extra: Partial<InvestimentoComDatas> = {}): InvestimentoComDatas => ({
  id: "a1",
  name: "Empresa de Ensaio",
  symbol: "abc.us",
  emCarteira: true,
  ...extra,
});

describe("datasAProximar", () => {
  /**
   * A razão de haver prazos diferentes por tipo. Se tudo aparecesse com dois
   * meses de antecedência, ao fim de uma semana ninguém lia aquela zona do ecrã
   * — e no dia em que uma data interessasse, já estava invisível.
   */
  it("mostra os resultados a catorze dias, e não a vinte", () => {
    expect(
      datasAProximar([acao({ nextEarningsDate: "2026-08-25" })], HOJE),
    ).toHaveLength(1);
    expect(
      datasAProximar([acao({ nextEarningsDate: "2026-09-01" })], HOJE),
    ).toEqual([]);
  });

  it("a data-ex avisa a sete dias", () => {
    expect(datasAProximar([acao({ exDividendDate: "2026-08-18" })], HOJE)).toHaveLength(1);
    expect(datasAProximar([acao({ exDividendDate: "2026-08-25" })], HOJE)).toEqual([]);
  });

  it("o pagamento avisa a cinco", () => {
    expect(datasAProximar([acao({ dividendDate: "2026-08-16" })], HOJE)).toHaveLength(1);
    expect(datasAProximar([acao({ dividendDate: "2026-08-20" })], HOJE)).toEqual([]);
  });

  /**
   * Uma apresentação de resultados de anteontem explica o salto na cotação que
   * se está a olhar hoje — e é aí que alguém pergunta "o que aconteceu a isto?".
   */
  it("uma data que passou há pouco continua a aparecer", () => {
    const r = datasAProximar([acao({ nextEarningsDate: "2026-08-10" })], HOJE);
    expect(r).toHaveLength(1);
    expect(r[0]!.emDias).toBe(-2);
  });

  it("uma data que passou há muito desaparece", () => {
    expect(datasAProximar([acao({ nextEarningsDate: "2026-07-20" })], HOJE)).toEqual([]);
  });

  /**
   * Uma empresa que já se vendeu continua a apresentar resultados, e isso não é
   * assunto de quem já não a tem.
   */
  it("ignora posições que já não estão em carteira", () => {
    expect(
      datasAProximar([acao({ emCarteira: false, nextEarningsDate: "2026-08-14" })], HOJE),
    ).toEqual([]);
  });

  it("ordena da mais próxima para a mais distante", () => {
    const r = datasAProximar(
      [
        acao({ id: "longe", name: "Longe", nextEarningsDate: "2026-08-24" }),
        acao({ id: "perto", name: "Perto", nextEarningsDate: "2026-08-13" }),
      ],
      HOJE,
    );
    expect(r.map((d) => d.assetId)).toEqual(["perto", "longe"]);
  });

  it("a mesma empresa pode ter mais do que uma data a caminho", () => {
    const r = datasAProximar(
      [acao({ nextEarningsDate: "2026-08-14", exDividendDate: "2026-08-15" })],
      HOJE,
    );
    expect(r.map((d) => d.tipo)).toEqual(["resultados", "ex-dividendo"]);
  });

  it("aguenta datas em falta e datas que não são datas", () => {
    expect(datasAProximar([acao()], HOJE)).toEqual([]);
    expect(datasAProximar([acao({ nextEarningsDate: "logo" })], HOJE)).toEqual([]);
  });
});

describe("quandoPorExtenso", () => {
  it("fala em dias, que é como a pergunta se faz", () => {
    expect(quandoPorExtenso(0)).toBe("hoje");
    expect(quandoPorExtenso(1)).toBe("amanhã");
    expect(quandoPorExtenso(2)).toBe("depois de amanhã");
    expect(quandoPorExtenso(9)).toBe("daqui a 9 dias");
  });

  it("e sabe falar do que já passou", () => {
    expect(quandoPorExtenso(-1)).toBe("ontem");
    expect(quandoPorExtenso(-2)).toBe("anteontem");
    expect(quandoPorExtenso(-3)).toBe("há 3 dias");
  });
});

describe("precisaDeDatas", () => {
  const agora = new Date("2026-08-12T12:00:00Z");

  it("nunca consultado é sempre para ir", () => {
    expect(precisaDeDatas(null, agora)).toBe(true);
    expect(precisaDeDatas(undefined, agora)).toBe(true);
  });

  it("uma semana chega, porque estas datas mudam quatro vezes por ano", () => {
    expect(precisaDeDatas("2026-08-10T12:00:00Z", agora)).toBe(false);
    expect(precisaDeDatas("2026-08-01T12:00:00Z", agora)).toBe(true);
  });

  it("um carimbo que não se lê trata-se como nunca consultado", () => {
    // Melhor ir buscar de mais do que confiar num valor que não se percebe.
    expect(precisaDeDatas("qualquer coisa", agora)).toBe(true);
  });
});
