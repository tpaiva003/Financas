import { describe, it, expect } from "vitest";
import { similarityKey, findSimilar } from "./similar";

describe("similarityKey", () => {
  it("junta o mesmo comerciante apesar do ruído do extrato", () => {
    // Descrições reais dos extratos do utilizador.
    const a = similarityKey("Compra Restaurante Abaco Porto");
    expect(similarityKey("Compra Restaurante Abaco Porto")).toBe(a);
    expect(similarityKey("COMPRA 1511 RESTAURANTE ABACO PORTO")).toBe(a);
  });

  it("ignora referências numéricas dos débitos diretos", () => {
    expect(similarityKey("DD VODAFONEPORTUGAL-07459083287")).toBe(
      similarityKey("DD VODAFONEPORTUGAL-11111111111"),
    );
  });

  it("não junta comerciantes diferentes", () => {
    expect(similarityKey("Compra Mercadona Porto")).not.toBe(
      similarityKey("Compra Auchan Gondomar Rio Tinto"),
    );
    expect(similarityKey("DD PETROGAL-00000580763")).not.toBe(
      similarityKey("DD UNIVERSO-75355539854"),
    );
  });

  it("devolve vazio quando só há ruído (não se sugere agrupar)", () => {
    expect(similarityKey("Compra")).toBe("");
    expect(similarityKey("1511")).toBe("");
    expect(similarityKey("")).toBe("");
  });
});

describe("findSimilar", () => {
  const descriptions = [
    "Compra Restaurante Abaco Porto",
    "Compra Mercadona Porto",
    "COMPRA 1511 RESTAURANTE ABACO PORTO",
    "DD VODAFONEPORTUGAL-07459083287",
    "Compra",
  ];

  it("encontra todas as linhas do mesmo comerciante", () => {
    expect(findSimilar(descriptions, 0).sort()).toEqual([0, 2]);
  });

  it("uma descrição sem semelhantes fica só consigo própria", () => {
    expect(findSimilar(descriptions, 1)).toEqual([1]);
    expect(findSimilar(descriptions, 3)).toEqual([3]);
  });

  it("descrições só com ruído não agrupam nada", () => {
    expect(findSimilar(descriptions, 4)).toEqual([4]);
  });
});
