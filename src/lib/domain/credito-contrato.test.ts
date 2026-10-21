import { describe, expect, it } from "vitest";

import { reviewContrato, type ContratoBruto } from "./credito-contrato";
import { prestacaoAnuidadeCents } from "./credito";

/**
 * Um contrato misto típico: 150 000 € a 30 anos, três anos de taxa fixa a 3,3%
 * e Euribor 6M + 0,9% até ao fim.
 */
function contrato(patch: Partial<ContratoBruto> = {}): ContratoBruto {
  return {
    capitalEur: 150_000,
    dataInicio: "2025-01-15",
    dataMaturidade: "2055-01-15",
    prazoMeses: 360,
    prestacaoInicialEur: prestacaoAnuidadeCents(150_000_00, 3.3, 360) / 100,
    periodos: [
      { inicioMesDoContrato: 0, tipo: "fixa", taxaPct: 3.3 },
      { inicioMesDoContrato: 36, tipo: "variavel", indexante: "euribor6m", spreadPct: 0.9 },
    ],
    ...patch,
  };
}

describe("reviewContrato", () => {
  it("aceita um contrato coerente e monta os períodos", () => {
    const r = reviewContrato(contrato());

    expect(r.usable).toBe(true);
    expect(r.capitalCents).toBe(150_000_00);
    expect(r.startDate).toBe("2025-01-15");
    expect(r.maturityDate).toBe("2055-01-15");
    expect(r.terms?.periods).toHaveLength(2);
    expect(r.terms?.periods[0]).toMatchObject({ startsOn: "2025-01-15", kind: "fixa", ratePct: 3.3 });
    expect(r.terms?.periods[1]).toMatchObject({
      startsOn: "2028-01-15",
      kind: "variavel",
      indexante: "euribor6m",
      spreadPct: 0.9,
    });
  });

  it("confirma a prestação do contrato recalculando-a", () => {
    const r = reviewContrato(contrato());

    expect(r.confirmacao?.bate).toBe(true);
    expect(Math.abs(r.confirmacao!.difCents)).toBeLessThanOrEqual(200);
  });

  /**
   * O caso que justifica o ficheiro todo: uma vírgula fora do sítio na taxa. O
   * formato continua perfeito, os números continuam plausíveis, e só a conta
   * apanha — a prestação a 0,33% é menos de metade da que o contrato imprime.
   */
  it("apanha uma taxa mal lida pela prestação que não bate certo", () => {
    const r = reviewContrato(contrato({ periodos: [{ inicioMesDoContrato: 0, tipo: "fixa", taxaPct: 0.33 }] }));

    expect(r.confirmacao?.bate).toBe(false);
    expect(r.confirmacao!.calculadaCents).toBeLessThan(r.confirmacao!.contratoCents);
    expect(r.avisos.join(" ")).toContain("seguros");
  });

  it("apanha um capital mal lido pela mesma conta", () => {
    const r = reviewContrato(contrato({ capitalEur: 1_500_000 }));

    expect(r.confirmacao?.bate).toBe(false);
    expect(r.confirmacao!.calculadaCents).toBeGreaterThan(r.confirmacao!.contratoCents);
    expect(r.avisos.join(" ")).toContain("mal lida");
  });

  /**
   * Uns euros de diferença não são um erro de leitura: são arredondamentos, ou
   * um seguro pequeno a ir na mesma prestação. Gritar aqui era ensinar quem
   * confirma a ignorar o aviso, e no dia em que ele fosse a sério já não valia.
   */
  it("deixa passar uns euros de diferença sem gritar", () => {
    const contas = prestacaoAnuidadeCents(150_000_00, 3.3, 360);
    const r = reviewContrato(contrato({ prestacaoInicialEur: (contas + 8_00) / 100 }));

    expect(r.confirmacao?.bate).toBe(true);
    expect(r.avisos.join(" ")).not.toContain("seguros");
  });

  it("não confirma nada quando o primeiro período é variável", () => {
    const r = reviewContrato(
      contrato({ periodos: [{ inicioMesDoContrato: 0, tipo: "variavel", indexante: "euribor6m", spreadPct: 0.9 }] }),
    );

    // Sem o valor do indexante não há taxa, e uma confirmação inventada era
    // pior do que confirmação nenhuma.
    expect(r.confirmacao).toBeNull();
    expect(r.usable).toBe(true);
  });

  it("nunca traz o valor do indexante do contrato", () => {
    const r = reviewContrato(contrato());

    expect(r.terms?.indexanteRates).toEqual({});
    expect(r.avisos.join(" ")).toContain("dia da escritura");
  });

  it("tira a maturidade do prazo quando não vem dita", () => {
    const r = reviewContrato(contrato({ dataMaturidade: null }));

    expect(r.maturityDate).toBe("2055-01-15");
    expect(r.usable).toBe(true);
  });

  it("avisa quando o prazo e a data de fim se contradizem", () => {
    const r = reviewContrato(contrato({ dataMaturidade: "2045-01-15" }));

    expect(r.avisos.join(" ")).toContain("Confirma qual está certa");
    // Não escolhe por ninguém: fica com a que o contrato diz por extenso.
    expect(r.maturityDate).toBe("2045-01-15");
  });

  it("recusa um capital absurdo em vez de o usar", () => {
    const r = reviewContrato(contrato({ capitalEur: 3 }));

    expect(r.capitalCents).toBeNull();
    expect(r.usable).toBe(false);
    expect(r.avisos.join(" ")).toContain("não faz sentido");
  });

  it("deita fora um período com taxa impossível e diz que o fez", () => {
    const r = reviewContrato(
      contrato({
        periodos: [
          { inicioMesDoContrato: 0, tipo: "fixa", taxaPct: 330 },
          { inicioMesDoContrato: 36, tipo: "variavel", indexante: "euribor6m", spreadPct: 0.9 },
        ],
      }),
    );

    expect(r.terms?.periods).toHaveLength(1);
    expect(r.terms?.periods[0]?.kind).toBe("variavel");
    expect(r.avisos.join(" ")).toContain("incompleto");
  });

  it("deita fora uma variável sem indexante conhecido", () => {
    const r = reviewContrato(
      contrato({ periodos: [{ inicioMesDoContrato: 0, tipo: "variavel", indexante: "euribor9m", spreadPct: 0.9 }] }),
    );

    expect(r.terms).toBeNull();
    expect(r.usable).toBe(false);
  });

  it("ignora períodos que começam depois do fim do crédito", () => {
    const r = reviewContrato(
      contrato({
        periodos: [
          { inicioMesDoContrato: 0, tipo: "fixa", taxaPct: 3.3 },
          { dataInicio: "2060-01-15", tipo: "fixa", taxaPct: 4 },
        ],
      }),
    );

    expect(r.terms?.periods).toHaveLength(1);
    expect(r.avisos.join(" ")).toContain("depois do fim");
  });

  it("fica com um só período quando dois começam no mesmo dia", () => {
    const r = reviewContrato(
      contrato({
        periodos: [
          { dataInicio: "2025-01-15", tipo: "fixa", taxaPct: 3.3 },
          { dataInicio: "2025-01-15", tipo: "fixa", taxaPct: 4.1 },
        ],
      }),
    );

    expect(r.terms?.periods).toHaveLength(1);
    expect(r.terms?.periods[0]?.ratePct).toBe(3.3);
    expect(r.avisos.join(" ")).toContain("dois períodos");
  });

  it("avisa quando o primeiro período começa depois da escritura", () => {
    const r = reviewContrato(
      contrato({ periodos: [{ inicioMesDoContrato: 6, tipo: "fixa", taxaPct: 3.3 }] }),
    );

    expect(r.avisos.join(" ")).toContain("depois do início do contrato");
  });

  it("recusa uma data com formato certo e mês que não existe", () => {
    const r = reviewContrato(contrato({ dataInicio: "2025-19-15" }));

    expect(r.startDate).toBeNull();
    expect(r.usable).toBe(false);
  });

  it("recusa uma maturidade anterior ao início", () => {
    const r = reviewContrato(contrato({ dataMaturidade: "2020-01-15", prazoMeses: null }));

    expect(r.maturityDate).toBeNull();
    expect(r.usable).toBe(false);
    expect(r.avisos.join(" ")).toContain("anterior ao início");
  });

  it("aguenta um objeto vazio sem atirar", () => {
    const r = reviewContrato({});

    expect(r.usable).toBe(false);
    expect(r.terms).toBeNull();
    expect(r.avisos.length).toBeGreaterThan(0);
  });
});
