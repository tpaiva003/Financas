import { describe, expect, it } from "vitest";
import {
  SEM_SETOR,
  carteiraPorSetor,
  empresasPorReforco,
  setorPorExtenso,
  type PosicaoDoSetor,
} from "./setores";

/** Valores redondos e inventados: nada de dinheiro real, nem em teste. */
function pos(p: Partial<PosicaoDoSetor> & { id: string }): PosicaoDoSetor {
  return {
    nome: `Empresa ${p.id}`,
    setor: null,
    valorCents: 0,
    custoCents: 0,
    reforcoCents: 0,
    ...p,
  };
}

describe("setorPorExtenso", () => {
  it("traduz os nomes que a fonte usa", () => {
    expect(setorPorExtenso("Technology")).toBe("Tecnologia");
    expect(setorPorExtenso("Financial Services")).toBe("Serviços financeiros");
  });

  /**
   * A fonte estreia classificações. Cair tudo o que não se reconhece em
   * "Outros" juntava numa fatia só coisas sem nada a ver umas com as outras, e
   * ninguém dava por isso.
   */
  it("deixa passar um nome que não conhece, em vez de o esconder", () => {
    expect(setorPorExtenso("Quantum Widgets")).toBe("Quantum Widgets");
  });

  it("vazio, espaços e ausente são todos por classificar", () => {
    expect(setorPorExtenso(null)).toBe(SEM_SETOR);
    expect(setorPorExtenso(undefined)).toBe(SEM_SETOR);
    expect(setorPorExtenso("   ")).toBe(SEM_SETOR);
  });
});

describe("carteiraPorSetor", () => {
  const carteira = [
    pos({ id: "a", setor: "Technology", valorCents: 60_000, custoCents: 40_000, reforcoCents: 40_000 }),
    pos({ id: "b", setor: "Technology", valorCents: 20_000, custoCents: 20_000, reforcoCents: 20_000 }),
    pos({ id: "c", setor: "Energy", valorCents: 20_000, custoCents: 25_000, reforcoCents: 25_000 }),
  ];

  it("agrupa, soma e pesa", () => {
    const r = carteiraPorSetor(carteira);
    expect(r.valorTotalCents).toBe(100_000);
    expect(r.grupos.map((g) => g.setor)).toEqual(["Tecnologia", "Energia"]);
    const tec = r.grupos[0]!;
    expect(tec.valorCents).toBe(80_000);
    expect(tec.pesoPct).toBe(80);
    expect(tec.ganhoCents).toBe(20_000);
    expect(tec.posicoes).toHaveLength(2);
  });

  /** O número que desfaz a sensação de diversificação. */
  it("diz qual é o maior setor", () => {
    expect(carteiraPorSetor(carteira).maior!.setor).toBe("Tecnologia");
  });

  it("as posições de um setor vêm da maior para a menor", () => {
    const r = carteiraPorSetor(carteira);
    expect(r.grupos[0]!.posicoes.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("um setor a perder tem ganho negativo, e não deixa de ter ganho", () => {
    const energia = carteiraPorSetor(carteira).grupos[1]!;
    expect(energia.ganhoCents).toBe(-5_000);
    expect(energia.ganhoPct).toBe(-20);
  });

  /**
   * A fatia calada é o modo de falha desta leitura: com metade da carteira sem
   * setor, "o maior setor tem 22%" pode estar errado por metade — e um gráfico
   * que só desenhe os classificados esconde exactamente isso.
   */
  it("os que não têm setor contam, aparecem e são contados", () => {
    const r = carteiraPorSetor([
      pos({ id: "a", setor: "Technology", valorCents: 50_000, custoCents: 50_000 }),
      pos({ id: "b", valorCents: 50_000, custoCents: 50_000 }),
    ]);
    expect(r.valorTotalCents).toBe(100_000);
    expect(r.porClassificar).toBe(1);
    expect(r.porClassificarPct).toBe(50);
    expect(r.grupos.map((g) => g.setor)).toContain(SEM_SETOR);
  });

  it("por classificar vai para o fim da lista, mesmo sendo o maior grupo", () => {
    const r = carteiraPorSetor([
      pos({ id: "a", setor: "Energy", valorCents: 10_000, custoCents: 10_000 }),
      pos({ id: "b", valorCents: 90_000, custoCents: 90_000 }),
    ]);
    expect(r.grupos[r.grupos.length - 1]!.setor).toBe(SEM_SETOR);
  });

  /**
   * O caso que dói: uma carteira acabada de importar, em que nada foi ainda
   * classificado. "Por classificar" é uma lacuna e não uma exposição — e um
   * ecrã que anuncie "o maior setor é Por classificar, com 100%" está a
   * apresentar a ausência de um dado como se fosse uma conclusão sobre a
   * carteira.
   */
  it("sem nada classificado não há maior setor nenhum", () => {
    const r = carteiraPorSetor([
      pos({ id: "a", valorCents: 60_000, custoCents: 60_000 }),
      pos({ id: "b", valorCents: 40_000, custoCents: 40_000 }),
    ]);
    expect(r.grupos).toHaveLength(1);
    expect(r.maior).toBeNull();
    expect(r.porClassificarPct).toBe(100);
  });

  it("uma posição fechada não é exposição a nada", () => {
    const r = carteiraPorSetor([
      pos({ id: "a", setor: "Energy", valorCents: 10_000, custoCents: 10_000 }),
      pos({ id: "fechada", setor: "Technology", reforcoCents: 90_000 }),
    ]);
    expect(r.grupos.map((g) => g.setor)).toEqual(["Energia"]);
  });

  /** Sem custo positivo, um ganho percentual é uma divisão que correu mal. */
  it("não inventa ganho sem custo", () => {
    const r = carteiraPorSetor([pos({ id: "a", setor: "Energy", valorCents: 10_000 })]);
    expect(r.grupos[0]!.ganhoCents).toBeNull();
    expect(r.grupos[0]!.ganhoPct).toBeNull();
  });

  it("uma carteira vazia não rebenta nem inventa um maior setor", () => {
    const r = carteiraPorSetor([]);
    expect(r.grupos).toEqual([]);
    expect(r.maior).toBeNull();
    expect(r.valorTotalCents).toBe(0);
    expect(r.porClassificarPct).toBe(0);
  });

  /**
   * As duas leituras separam-se de propósito: um setor que subiu muito ocupa
   * mais peso do que alguma vez se decidiu dar-lhe, e é assim que uma
   * concentração aparece sem ninguém a ter escolhido.
   */
  it("o peso no valor de hoje não é o peso no dinheiro que entrou", () => {
    const r = carteiraPorSetor([
      pos({ id: "a", setor: "Technology", valorCents: 90_000, custoCents: 10_000, reforcoCents: 10_000 }),
      pos({ id: "b", setor: "Energy", valorCents: 10_000, custoCents: 10_000, reforcoCents: 10_000 }),
    ]);
    expect(r.grupos[0]!.pesoPct).toBe(90);
    expect(r.grupos[0]!.pesoDoReforcoPct).toBe(50);
  });

  it("sem dinheiro registado a entrar, o peso do reforço não se inventa", () => {
    const r = carteiraPorSetor([pos({ id: "a", setor: "Energy", valorCents: 10_000, custoCents: 10_000 })]);
    expect(r.grupos[0]!.pesoDoReforcoPct).toBeNull();
  });
});

describe("empresasPorReforco", () => {
  /**
   * Ordena pelo dinheiro que entrou e não pelo valor: a pergunta é sobre as
   * decisões que se tomaram, e a maior posição de hoje pode ser a que menos
   * dinheiro levou.
   */
  it("ordena pelo dinheiro que entrou, não pelo valor de hoje", () => {
    const r = empresasPorReforco([
      pos({ id: "subiu", valorCents: 90_000, custoCents: 10_000, reforcoCents: 10_000 }),
      pos({ id: "grande", valorCents: 30_000, custoCents: 40_000, reforcoCents: 40_000 }),
    ]);
    expect(r.map((e) => e.id)).toEqual(["grande", "subiu"]);
    expect(r[0]!.pesoDoReforcoPct).toBe(80);
  });

  it("quem nunca recebeu dinheiro registado fica de fora", () => {
    const r = empresasPorReforco([pos({ id: "a", valorCents: 10_000 })]);
    expect(r).toEqual([]);
  });

  it("traz o setor já por extenso", () => {
    const r = empresasPorReforco([pos({ id: "a", setor: "Healthcare", reforcoCents: 100 })]);
    expect(r[0]!.setorPorExtenso).toBe("Saúde");
  });
});
