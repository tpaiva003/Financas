import { describe, expect, it } from "vitest";
import {
  editDistance,
  identifyMerchant,
  merchantKey,
  suggestMerges,
} from "./merchants";

describe("identifyMerchant, marcas conhecidas", () => {
  it("junta as lojas da mesma cadeia", () => {
    // O caso que falhava: as duas primeiras palavras são diferentes, mas é o
    // mesmo sítio e tem de contar junto.
    const a = identifyMerchant("CONTINENTE MODELO MATOSINHOS");
    const b = identifyMerchant("CONT BOM DIA PORTO");
    const c = identifyMerchant("COMPRA 4471 CONTINENTE");
    expect(a.key).toBe("continente");
    expect(b.key).toBe("continente");
    expect(c.key).toBe("continente");
    expect(a.label).toBe("Continente");
    expect(a.source).toBe("brand");
  });

  it("apanha a marca mesmo depois do ruído do extrato", () => {
    expect(merchantKey("DD VODAFONEPORTUGAL-07459083287")).toBe("vodafone");
    expect(merchantKey("COMPRA NA INTERNET NETFLIX.COM")).toBe("netflix");
    expect(merchantKey("PAGAMENTO DE SERVICOS EDP COMERCIAL")).toBe("edp");
  });

  it("reconhece variantes de escrita", () => {
    expect(merchantKey("PINGO DOCE SETUBAL")).toBe("pingo-doce");
    expect(merchantKey("PINGODOCE LISBOA")).toBe("pingo-doce");
  });

  it("distingue marcas diferentes", () => {
    expect(merchantKey("LIDL BRAGA")).not.toBe(merchantKey("ALDI BRAGA"));
  });
});

describe("identifyMerchant, sem marca conhecida", () => {
  it("usa as duas primeiras palavras", () => {
    const m = identifyMerchant("Restaurante Abaco Porto");
    expect(m.key).toBe("restaurante abaco");
    expect(m.source).toBe("words");
  });

  it("ignora números e o tipo de operação", () => {
    expect(merchantKey("COMPRA 1511 LEITARIA QUINTA")).toBe("leitaria quinta");
  });

  it("devolve chave vazia quando não sobra nada", () => {
    expect(merchantKey("TRANSFERENCIA")).toBe("");
    expect(merchantKey("")).toBe("");
    expect(merchantKey("12345")).toBe("");
  });

  it("dá um nome apresentável mesmo sem chave", () => {
    expect(identifyMerchant("TRANSFERENCIA").label).toBe("TRANSFERENCIA");
  });
});

describe("apelidos confirmados", () => {
  const aliases = { "loja qualquer": { key: "loja-do-ze", label: "Loja do Zé" } };

  it("ganham à deteção por palavras", () => {
    const m = identifyMerchant("LOJA QUALQUER LDA", aliases);
    expect(m.key).toBe("loja-do-ze");
    expect(m.label).toBe("Loja do Zé");
    expect(m.source).toBe("alias");
  });

  it("ganham também às marcas", () => {
    // Se a pessoa disse que é outra coisa, é outra coisa. Nós é que estamos
    // a adivinhar, ela é que sabe.
    const m = identifyMerchant("CONTINENTE", { continente: { key: "x", label: "Outro" } });
    expect(m.key).toBe("x");
  });
});

describe("editDistance", () => {
  it("mede diferenças pequenas", () => {
    expect(editDistance("porto", "pporto")).toBe(1);
    expect(editDistance("abaco", "abaco")).toBe(0);
  });

  it("desiste depressa quando é muito diferente", () => {
    expect(editDistance("continente", "farmacia")).toBeGreaterThan(3);
  });
});

describe("suggestMerges", () => {
  it("propõe juntar o que é prefixo", () => {
    const s = suggestMerges(["padaria central", "padaria central lda"]);
    expect(s).toHaveLength(1);
    expect(s[0]!.keys).toContain("padaria central lda");
    expect(s[0]!.label).toBe("padaria central");
    expect(s[0]!.reason).toBe("prefixo");
  });

  it("propõe juntar quase-iguais (erros de escrita)", () => {
    const s = suggestMerges(["leitaria pporto", "leitaria porto"]);
    expect(s).toHaveLength(1);
  });

  it("junta pela primeira palavra quando é específica", () => {
    const s = suggestMerges(["decathlon gaia", "decathlon matosinhos"]);
    expect(s[0]!.keys).toHaveLength(2);
    expect(s[0]!.reason).toBe("primeira palavra");
  });

  it("NÃO junta por palavras genéricas e curtas", () => {
    // "cafe" apanharia meio mundo: exige-se pelo menos cinco letras.
    expect(suggestMerges(["cafe lisboa", "cafe porto"])).toEqual([]);
  });

  it("não propõe nada quando são mesmo diferentes", () => {
    expect(suggestMerges(["farmacia sa", "galp energia"])).toEqual([]);
  });

  it("nunca junta sozinha, só propõe", () => {
    // O contrato: devolve propostas, não altera nada. Um agrupamento errado
    // estraga relatórios de forma difícil de detetar.
    const entrada = ["padaria central", "padaria central lda"];
    suggestMerges(entrada);
    expect(entrada).toEqual(["padaria central", "padaria central lda"]);
  });

  it("cada comerciante entra numa proposta só", () => {
    const s = suggestMerges(["loja aberta", "loja aberta lda", "loja aberta sa"]);
    expect(s).toHaveLength(1);
    expect(s[0]!.keys).toHaveLength(3);
  });
});
