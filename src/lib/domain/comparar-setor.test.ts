import { describe, expect, it } from "vitest";
import { compararNoSetor, confiancaPorExtenso, mediana } from "./comparar-setor";

describe("mediana", () => {
  it("com um número ímpar de valores é o do meio", () => {
    expect(mediana([10, 30, 20])).toBe(20);
  });

  it("com um número par é a média dos dois do meio", () => {
    expect(mediana([10, 20, 30, 40])).toBe(25);
  });

  /**
   * É por isto que se usa mediana e não média: uma posição com 90% puxa a média
   * para um sítio onde não está empresa nenhuma.
   */
  it("não se deixa arrastar por um extremo", () => {
    expect(mediana([10, 12, 14, 90])).toBe(13);
    const media = (10 + 12 + 14 + 90) / 4;
    expect(mediana([10, 12, 14, 90])).toBeLessThan(media);
  });

  it("sem valores não há mediana", () => {
    expect(mediana([])).toBeNull();
  });
});

describe("compararNoSetor", () => {
  const carteira = [
    { id: "a", nome: "Alfa", setor: "Technology", valor: 20 },
    { id: "b", nome: "Beta", setor: "Technology", valor: 14 },
    { id: "c", nome: "Gama", setor: "Energy", valor: 8 },
  ];

  it("compara com as do mesmo setor, e só com essas", () => {
    const r = compararNoSetor({ setor: "Technology", valorDaEmpresa: 25, carteira })!;
    expect(r.quantas).toBe(2);
    expect(r.medianaDaCarteira).toBe(17);
    expect(r.diferenca).toBe(8);
    expect(r.pares.map((p) => p.id)).toEqual(["a", "b"]);
  });

  /**
   * Um "está acima do setor" apoiado em nada é a pior das respostas possíveis,
   * porque é a mais convincente.
   */
  it("não compara quando não há com quem", () => {
    expect(compararNoSetor({ setor: "Healthcare", valorDaEmpresa: 25, carteira })).toBeNull();
    expect(compararNoSetor({ setor: null, valorDaEmpresa: 25, carteira })).toBeNull();
    expect(compararNoSetor({ setor: "  ", valorDaEmpresa: 25, carteira })).toBeNull();
  });

  it("sem o indicador da empresa em estudo não há comparação", () => {
    expect(compararNoSetor({ setor: "Technology", valorDaEmpresa: null, carteira })).toBeNull();
  });

  /** Comparar uma coisa consigo própria dá sempre zero e não informa nada. */
  it("exclui a própria empresa quando ela já está na carteira", () => {
    const r = compararNoSetor({
      setor: "Technology",
      valorDaEmpresa: 20,
      carteira,
      excluirId: "a",
    })!;
    expect(r.quantas).toBe(1);
    expect(r.pares[0]!.id).toBe("b");
    expect(r.medianaDaCarteira).toBe(14);
  });

  it("uma empresa da carteira sem o indicador fica de fora da conta", () => {
    const r = compararNoSetor({
      setor: "Technology",
      valorDaEmpresa: 25,
      carteira: [...carteira, { id: "d", nome: "Delta", setor: "Technology", valor: null }],
    })!;
    expect(r.quantas).toBe(2);
  });

  it("uma diferença negativa é uma diferença, e não uma comparação ausente", () => {
    const r = compararNoSetor({ setor: "Technology", valorDaEmpresa: 5, carteira })!;
    expect(r.diferenca).toBe(-12);
  });
});

describe("confiancaPorExtenso", () => {
  /**
   * Com uma empresa só não há mediana nenhuma — há a outra empresa. Dizê-lo
   * evita que a frase passe por uma leitura estatística.
   */
  it("com uma empresa não chama mediana a nada", () => {
    expect(confiancaPorExtenso(1)).toContain("a outra empresa");
    expect(confiancaPorExtenso(1)).not.toContain("Mediana");
  });

  it("com poucas empresas avisa que são poucas", () => {
    expect(confiancaPorExtenso(3)).toContain("poucas");
  });

  it("com uma base decente diz que é mediana", () => {
    expect(confiancaPorExtenso(6)).toContain("Mediana");
  });
});
