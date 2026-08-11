import { describe, expect, it } from "vitest";
import { calcularDcf, intervaloDcf, type DcfInput } from "./dcf";

/** Uma empresa simples, com números redondos para se poder conferir à mão. */
function base(over: Partial<DcfInput> = {}): DcfInput {
  return {
    fcfCents: 100_00, // 100 € de fluxo livre
    crescimentoPct: 0,
    crescimentoPerpetuoPct: 0,
    descontoPct: 10,
    anos: 1,
    dividaLiquidaCents: 0,
    acoes: 1,
    ...over,
  };
}

function ok(i: DcfInput) {
  const r = calcularDcf(i);
  if ("erro" in r) throw new Error(`esperava resultado: ${r.erro}`);
  return r.ok;
}

describe("calcularDcf — a aritmética", () => {
  /**
   * Sem crescimento nenhum, o fluxo do ano 1 é 100 € e o valor terminal é uma
   * perpetuidade de 100 €/ano a 10%, ou seja 1000 €, descontada um ano.
   * Total: 100/1,1 + 1000/1,1 = 1000 €.
   */
  it("bate certo num caso que se confere à mão", () => {
    const r = ok(base());
    expect(r.anos[0]!.fcfCents).toBe(10_000);
    expect(r.empresaCents).toBe(100_000);
    expect(r.valorPorAcaoCents).toBe(100_000);
  });

  it("a dívida líquida sai do valor dos acionistas", () => {
    const r = ok(base({ dividaLiquidaCents: 40_000 }));
    expect(r.capitalProprioCents).toBe(60_000);
  });

  it("caixa a mais soma, porque a dívida líquida é negativa", () => {
    const r = ok(base({ dividaLiquidaCents: -20_000 }));
    expect(r.capitalProprioCents).toBe(120_000);
  });

  it("divide pelas ações", () => {
    expect(ok(base({ acoes: 4 })).valorPorAcaoCents).toBe(25_000);
  });

  it("o crescimento faz o fluxo crescer ano a ano", () => {
    const r = ok(base({ crescimentoPct: 10, anos: 2 }));
    expect(r.anos[0]!.fcfCents).toBe(11_000);
    expect(r.anos[1]!.fcfCents).toBe(12_100);
  });

  it("diz quanto do valor vem do infinito", () => {
    // No caso de referência, 1000/1,1 dos 1000 totais: 100%… menos o ano 1.
    const r = ok(base());
    expect(r.pesoDoTerminalPct).toBeGreaterThan(80);
  });
});

describe("calcularDcf — as recusas", () => {
  /**
   * A recusa mais importante. Com crescimento perpétuo igual ou acima da taxa
   * de desconto, a fórmula divide por zero ou por um negativo — e cospe um
   * valor enorme ou negativo com ar de resposta.
   */
  it("recusa crescimento perpétuo acima da taxa de desconto", () => {
    const r = calcularDcf(base({ crescimentoPerpetuoPct: 10, descontoPct: 10 }));
    expect("erro" in r).toBe(true);
    const r2 = calcularDcf(base({ crescimentoPerpetuoPct: 12, descontoPct: 10 }));
    expect("erro" in r2).toBe(true);
  });

  it("aceita quando fica abaixo, mesmo que por pouco", () => {
    expect("ok" in calcularDcf(base({ crescimentoPerpetuoPct: 9.9, descontoPct: 10 }))).toBe(true);
  });

  it("recusa um fluxo de caixa negativo, e explica porquê", () => {
    const r = calcularDcf(base({ fcfCents: -1_000 }));
    expect("erro" in r && r.erro).toContain("positivo");
  });

  it("recusa sem ações e sem taxa de desconto", () => {
    expect("erro" in calcularDcf(base({ acoes: 0 }))).toBe(true);
    expect("erro" in calcularDcf(base({ descontoPct: 0 }))).toBe(true);
  });

  it("recusa projeções absurdamente longas", () => {
    expect("erro" in calcularDcf(base({ anos: 50 }))).toBe(true);
    expect("erro" in calcularDcf(base({ anos: 0 }))).toBe(true);
  });
});

describe("margem de segurança", () => {
  it("é positiva quando o preço está abaixo do valor", () => {
    const r = ok(base({ precoAtualCents: 50_000 }));
    expect(r.margemDeSegurancaPct).toBe(50);
  });

  it("é negativa quando o preço está acima", () => {
    const r = ok(base({ precoAtualCents: 200_000 }));
    expect(r.margemDeSegurancaPct).toBe(-100);
  });

  it("sem preço não se inventa uma margem", () => {
    expect(ok(base()).margemDeSegurancaPct).toBeNull();
  });
});

describe("sensibilidade", () => {
  /**
   * O ponto todo: um ponto percentual na taxa de desconto muda o valor em
   * dezenas de por cento. Um DCF apresentado como número único esconde isso.
   */
  it("mostra o quanto o resultado depende dos pressupostos", () => {
    const r = ok(base({ descontoPct: 10, crescimentoPerpetuoPct: 2 }));
    const { minCents, maxCents } = intervaloDcf(r);
    expect(minCents).toBeLessThan(r.valorPorAcaoCents);
    expect(maxCents).toBeGreaterThan(r.valorPorAcaoCents);
    // Com estes pressupostos, um ponto no desconto mexe mais de 10%.
    expect((maxCents - minCents) / r.valorPorAcaoCents).toBeGreaterThan(0.1);
  });

  it("salta as combinações que se tornam impossíveis", () => {
    // Com desconto a 2,4% e perpétuo a 2%, o "+0,5 p.p." no perpétuo
    // ultrapassa o desconto e não pode dar valor nenhum.
    const r = ok(base({ descontoPct: 2.4, crescimentoPerpetuoPct: 2 }));
    expect(r.sensibilidade.length).toBeLessThan(4);
    expect(r.sensibilidade.every((s) => Number.isFinite(s.valorPorAcaoCents))).toBe(true);
  });
});
