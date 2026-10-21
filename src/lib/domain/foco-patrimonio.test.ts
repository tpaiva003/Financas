import { describe, expect, it } from "vitest";
import {
  FOCOS,
  contaDividas,
  contaNoFoco,
  focoDe,
  focoValido,
  focoVazioPorExtenso,
  snapshotsDoFoco,
} from "./foco-patrimonio";
import type { NetWorthSnapshot } from "./networth-history";

describe("focoValido", () => {
  /**
   * Abrir a app numa vista parcial faria alguém ler um total que não é o seu.
   */
  it("por omissão é tudo", () => {
    expect(focoValido(null)).toBe("tudo");
    expect(focoValido(undefined)).toBe("tudo");
    expect(focoValido("")).toBe("tudo");
    expect(focoValido("qualquer-coisa")).toBe("tudo");
  });

  it("aceita os focos que existem", () => {
    for (const f of FOCOS) expect(focoValido(f.id)).toBe(f.id);
  });
});

describe("contaNoFoco", () => {
  it("tudo conta tudo", () => {
    for (const k of ["conta", "investimento", "imovel", "outro", "divida"] as const) {
      expect(contaNoFoco(k, "tudo")).toBe(true);
    }
  });

  it("o foco dos investimentos deixa a casa de fora", () => {
    expect(contaNoFoco("investimento", "investimento")).toBe(true);
    expect(contaNoFoco("imovel", "investimento")).toBe(false);
    expect(contaNoFoco("conta", "investimento")).toBe(false);
  });

  /**
   * O crédito à habitação anda com a casa: é o líquido do imóvel que interessa
   * a quem escolhe este foco, e não o valor bruto de uma casa que está
   * hipotecada.
   */
  it("o foco dos imóveis leva as dívidas consigo", () => {
    expect(contaNoFoco("imovel", "imovel")).toBe(true);
    expect(contaNoFoco("divida", "imovel")).toBe(true);
    expect(contaNoFoco("investimento", "imovel")).toBe(false);
  });

  it("a liquidez é só contas", () => {
    expect(contaNoFoco("conta", "liquidez")).toBe(true);
    expect(contaNoFoco("investimento", "liquidez")).toBe(false);
    expect(contaNoFoco("divida", "liquidez")).toBe(false);
  });
});

describe("contaDividas", () => {
  /**
   * Num foco de investimentos o crédito à habitação não tem nada que subtrair,
   * e subtraí-lo dava um "líquido" negativo que não corresponde a decisão
   * nenhuma.
   */
  it("só em tudo e em imóveis", () => {
    expect(contaDividas("tudo")).toBe(true);
    expect(contaDividas("imovel")).toBe(true);
    expect(contaDividas("investimento")).toBe(false);
    expect(contaDividas("liquidez")).toBe(false);
  });
});

describe("focoDe", () => {
  it("um id desconhecido cai em tudo, e não rebenta", () => {
    expect(focoDe("nada" as never).id).toBe("tudo");
  });

  it("cada foco diz a que pergunta responde", () => {
    // Um chip sem explicação obriga a carregar para descobrir o que faz.
    for (const f of FOCOS) expect(f.pergunta.length).toBeGreaterThan(10);
  });
});

describe("snapshotsDoFoco", () => {
  /** Valores redondos e inventados: nada de dinheiro real, nem em teste. */
  const com = (porTipo?: Record<string, number>): NetWorthSnapshot => ({
    onDate: "2026-01-31",
    assetsCents: 300_000,
    debtsCents: 100_000,
    netCents: 200_000,
    porTipo,
  });

  it("em tudo passa tudo, sem tocar nos números", () => {
    const s = [com({ conta: 100_000, investimento: 200_000, divida: 100_000 }), com()];
    const r = snapshotsDoFoco(s, "tudo");
    expect(r.snapshots).toHaveLength(2);
    expect(r.semReparticao).toBe(0);
    expect(r.snapshots[0]!.netCents).toBe(200_000);
  });

  it("no foco dos investimentos o líquido é só a parte investida", () => {
    const r = snapshotsDoFoco(
      [com({ conta: 100_000, investimento: 200_000, divida: 100_000 })],
      "investimento",
    );
    expect(r.snapshots[0]!.assetsCents).toBe(200_000);
    // A dívida não desconta aqui: não há nada que ela financie nesta vista.
    expect(r.snapshots[0]!.debtsCents).toBe(0);
    expect(r.snapshots[0]!.netCents).toBe(200_000);
  });

  it("no foco dos imóveis a dívida desconta", () => {
    const r = snapshotsDoFoco(
      [com({ imovel: 500_000, investimento: 200_000, divida: 300_000 })],
      "imovel",
    );
    expect(r.snapshots[0]!.assetsCents).toBe(500_000);
    expect(r.snapshots[0]!.debtsCents).toBe(300_000);
    expect(r.snapshots[0]!.netCents).toBe(200_000);
  });

  /**
   * O ponto que não sabe repartir-se sai da série. Reparti-lo pelas proporções
   * de hoje desenhava uma linha de investimentos que nunca existiu — e uma
   * linha desenhada tem ar de facto.
   */
  it("os pontos sem repartição saem da série e são contados", () => {
    const r = snapshotsDoFoco(
      [com(), com({ investimento: 200_000 }), com()],
      "investimento",
    );
    expect(r.snapshots).toHaveLength(1);
    expect(r.semReparticao).toBe(2);
  });

  it("um tipo em falta na repartição conta zero, não rebenta", () => {
    const r = snapshotsDoFoco([com({ conta: 100_000 })], "investimento");
    expect(r.snapshots[0]!.netCents).toBe(0);
  });
});

describe("focoVazioPorExtenso", () => {
  it("a frase muda com o foco", () => {
    // Um ecrã vazio sem explicação lê-se como avaria — e o que falta registar é
    // diferente em cada vista.
    expect(focoVazioPorExtenso("imovel")).toContain("imóveis");
    expect(focoVazioPorExtenso("investimento")).toContain("investimentos");
    expect(focoVazioPorExtenso("liquidez")).toContain("contas");
    expect(focoVazioPorExtenso("tudo")).toContain("património");
  });
});
