import { describe, expect, it } from "vitest";
import { CENARIOS_POR_OMISSAO, avaliarCenarios } from "./dcf-cenarios";
import { calcularDcf } from "./dcf";

/**
 * Os números da folha de cálculo que isto vem substituir, para se poder
 * conferir contra ela: 5,564 mil milhões de fluxo livre, 0,283 mil milhões de
 * ações, dívida líquida negativa de 0,435 mil milhões, desconto a 8,5%,
 * perpétuo a 2%, dez anos, margem de 30%, preço de 409,75.
 */
const BASE = {
  fcfCents: Math.round(5.564 * 1_000_000_000 * 100),
  crescimentoPerpetuoPct: 2,
  descontoPct: 8.5,
  anos: 10,
  anosPrimeiraFase: 5,
  dividaLiquidaCents: Math.round(-0.435 * 1_000_000_000 * 100),
  acoes: 0.283 * 1_000_000_000,
  precoAtualCents: 409_75,
};

function ok(r: ReturnType<typeof avaliarCenarios>) {
  if ("erro" in r) throw new Error(r.erro);
  return r.ok;
}

describe("avaliarCenarios — contra a folha de cálculo", () => {
  const r = () =>
    ok(avaliarCenarios({ base: BASE, cenarios: CENARIOS_POR_OMISSAO, margemPct: 30 }));

  /**
   * A folha dá 405,69 / 492,17 / 674,60 por ação — e isto dá o mesmo ao
   * cêntimo. A precisão apertada é de propósito: um teste com tolerância larga
   * continuaria a passar depois de alguém trocar a fórmula do valor terminal
   * ou a ordem das fases, que é exactamente o que ele existe para impedir.
   */
  it("o valor por ação bate com a folha em cada cenário", () => {
    const [baixo, medio, alto] = r().cenarios;
    expect(baixo!.valorPorAcaoCents / 100).toBeCloseTo(405.69, 2);
    expect(medio!.valorPorAcaoCents / 100).toBeCloseTo(492.17, 2);
    expect(alto!.valorPorAcaoCents / 100).toBeCloseTo(674.6, 2);
  });

  it("a margem de segurança dá o preço a que se compra", () => {
    const [baixo, medio, alto] = r().cenarios;
    // 30% abaixo: 283,98 / 344,52 / 472,22 na folha.
    expect(baixo!.comMargemCents / 100).toBeCloseTo(283.98, 2);
    expect(medio!.comMargemCents / 100).toBeCloseTo(344.52, 2);
    expect(alto!.comMargemCents / 100).toBeCloseTo(472.22, 2);
  });

  it("o preço ponderado é a média pesada dos preços de compra", () => {
    // 25% x 283,98 + 50% x 344,52 + 25% x 472,22 = 361,31.
    expect(r().precoPonderadoCents / 100).toBeCloseTo(361.31, 2);
  });

  it("o veredicto sai da comparação com o preço de mercado", () => {
    const a = r();
    // 361,31 contra 409,75: −11,8%, tal como a folha.
    expect(a.upsidePonderadoPct).toBe(-11.8);
    expect(a.atrativo).toBe(false);
  });

  it("cada cenário diz o seu próprio desvio face ao preço", () => {
    const [baixo, , alto] = r().cenarios;
    expect(baixo!.upsidePct).toBeLessThan(0);
    expect(alto!.upsidePct).toBeGreaterThan(0);
  });
});

describe("avaliarCenarios — as recusas", () => {
  /**
   * A recusa que mais importa. Com 25/50/20 a média sai 5% abaixo da
   * verdadeira e nada no ecrã denuncia que faltavam cinco pontos.
   */
  it("recusa probabilidades que não somam cem", () => {
    const r = avaliarCenarios({
      base: BASE,
      cenarios: [
        { id: "baixo", crescimentoPct: 6, crescimentoTardioPct: 5, probabilidadePct: 25 },
        { id: "medio", crescimentoPct: 9, crescimentoTardioPct: 7, probabilidadePct: 50 },
        { id: "alto", crescimentoPct: 15, crescimentoTardioPct: 9, probabilidadePct: 20 },
      ],
      margemPct: 30,
    });
    expect("erro" in r && r.erro).toContain("100%");
  });

  it("aguenta meio ponto de arredondamento", () => {
    const r = avaliarCenarios({
      base: BASE,
      cenarios: [
        { id: "baixo", crescimentoPct: 6, crescimentoTardioPct: 5, probabilidadePct: 33.3 },
        { id: "medio", crescimentoPct: 9, crescimentoTardioPct: 7, probabilidadePct: 33.3 },
        { id: "alto", crescimentoPct: 15, crescimentoTardioPct: 9, probabilidadePct: 33.4 },
      ],
      margemPct: 30,
    });
    expect("ok" in r).toBe(true);
  });

  it("recusa uma margem impossível", () => {
    expect("erro" in avaliarCenarios({ base: BASE, cenarios: CENARIOS_POR_OMISSAO, margemPct: 100 })).toBe(true);
    expect("erro" in avaliarCenarios({ base: BASE, cenarios: CENARIOS_POR_OMISSAO, margemPct: -5 })).toBe(true);
  });

  it("diz qual o cenário que não deu, em vez de um erro anónimo", () => {
    const r = avaliarCenarios({
      base: { ...BASE, crescimentoPerpetuoPct: 20 },
      cenarios: CENARIOS_POR_OMISSAO,
      margemPct: 30,
    });
    expect("erro" in r && r.erro).toContain("pessimista");
  });

  it("sem preço de mercado não há veredicto nenhum", () => {
    const a = ok(
      avaliarCenarios({
        base: { ...BASE, precoAtualCents: null },
        cenarios: CENARIOS_POR_OMISSAO,
        margemPct: 30,
      }),
    );
    expect(a.atrativo).toBeNull();
    expect(a.upsidePonderadoPct).toBeNull();
  });
});

describe("crescimento em duas fases", () => {
  /**
   * Uma empresa que cresce 15% não cresce 15% durante dez anos. Projetar a taxa
   * dos primeiros anos até ao fim inflaciona o valor terminal — que já é a
   * maior parte do resultado — e o exagero entra onde menos se vê.
   */
  it("a segunda fase trava o crescimento, e isso baixa o valor", () => {
    const comum = { ...BASE, crescimentoPct: 15 };
    const umaFase = calcularDcf(comum);
    const duasFases = calcularDcf({ ...comum, crescimentoTardioPct: 9 });
    if ("erro" in umaFase || "erro" in duasFases) throw new Error("esperava resultado");
    expect(duasFases.ok.valorPorAcaoCents).toBeLessThan(umaFase.ok.valorPorAcaoCents);
  });

  it("cada ano diz a que taxa cresceu", () => {
    const r = calcularDcf({ ...BASE, crescimentoPct: 15, crescimentoTardioPct: 9 });
    if ("erro" in r) throw new Error("esperava resultado");
    expect(r.ok.anos[0]!.crescimentoPct).toBe(15);
    expect(r.ok.anos[4]!.crescimentoPct).toBe(15);
    expect(r.ok.anos[5]!.crescimentoPct).toBe(9);
  });

  it("sem segunda fase vale a taxa da primeira em todos os anos", () => {
    const r = calcularDcf({ ...BASE, crescimentoPct: 7 });
    if ("erro" in r) throw new Error("esperava resultado");
    expect(r.ok.anos.every((a) => a.crescimentoPct === 7)).toBe(true);
  });
});
