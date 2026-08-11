import { describe, expect, it } from "vitest";
import {
  contarPorEtapa,
  etapaSugerida,
  etapaValida,
  montarFunil,
  lerCenarios,
  quantoFaltaDescer,
  type AvaliacaoResumo,
} from "./avaliacoes";

const base: AvaliacaoResumo = {
  id: "a1",
  simbolo: "abc.us",
  nome: "Empresa de Ensaio",
  etapa: "esperar",
  data: "2026-08-01",
  precoPonderadoCents: 300_00,
  precoNaAlturaCents: 400_00,
  upsidePct: -25,
  notas: null,
};

describe("montarFunil", () => {
  it("ordena da mais recente para a mais antiga", () => {
    const f = montarFunil(
      [
        { ...base, id: "velha", data: "2025-01-10" },
        { ...base, id: "nova", data: "2026-08-01" },
      ],
      "2026-08-11",
    );
    expect(f.map((a) => a.id)).toEqual(["nova", "velha"]);
  });

  /**
   * Dois estudos da mesma empresa com valores diferentes e nada a dizer qual é
   * o que conta são piores do que um estudo só: quem olha escolhe o número que
   * lhe agrada, sem saber que está a escolher.
   */
  it("marca como substituída a que tem um estudo mais recente do mesmo símbolo", () => {
    const f = montarFunil(
      [
        { ...base, id: "velha", data: "2025-01-10" },
        { ...base, id: "nova", data: "2026-08-01" },
      ],
      "2026-08-11",
    );
    expect(f.find((a) => a.id === "nova")!.substituida).toBe(false);
    expect(f.find((a) => a.id === "velha")!.substituida).toBe(true);
  });

  it("não confunde empresas diferentes", () => {
    const f = montarFunil(
      [
        { ...base, id: "a", simbolo: "abc.us", data: "2026-08-01" },
        { ...base, id: "b", simbolo: "xyz.us", data: "2025-01-10" },
      ],
      "2026-08-11",
    );
    expect(f.every((a) => !a.substituida)).toBe(true);
  });

  /**
   * Sem o caso do nome, duas avaliações de uma empresa sem ticker nunca se
   * veriam uma à outra — e é aí que a data é a única coisa que as distingue.
   */
  it("compara pelo nome quando não há símbolo", () => {
    const f = montarFunil(
      [
        { ...base, id: "velha", simbolo: null, data: "2025-01-10" },
        { ...base, id: "nova", simbolo: null, data: "2026-08-01" },
      ],
      "2026-08-11",
    );
    expect(f.find((a) => a.id === "velha")!.substituida).toBe(true);
  });

  it("conta a idade em dias", () => {
    const f = montarFunil([{ ...base, data: "2026-08-01" }], "2026-08-11");
    expect(f[0]!.idadeDias).toBe(10);
  });

  /**
   * Seis meses são dois trimestres: o fluxo de caixa que serviu de base ao
   * estudo já foi substituído duas vezes por outro que ninguém pôs aqui.
   */
  it("avisa quando os pressupostos passaram de meio ano", () => {
    const f = montarFunil([{ ...base, data: "2026-01-01" }], "2026-08-11");
    expect(f[0]!.envelhecida).toBe(true);
    expect(montarFunil([{ ...base, data: "2026-07-01" }], "2026-08-11")[0]!.envelhecida).toBe(false);
  });

  it("não marca de velha uma avaliação que já está marcada de substituída", () => {
    const f = montarFunil(
      [
        { ...base, id: "velha", data: "2024-01-01" },
        { ...base, id: "nova", data: "2026-08-01" },
      ],
      "2026-08-11",
    );
    // Duas marcas no mesmo cartão não dizem mais do que uma.
    expect(f.find((a) => a.id === "velha")!.envelhecida).toBe(false);
    expect(f.find((a) => a.id === "velha")!.substituida).toBe(true);
  });
});

describe("contarPorEtapa", () => {
  it("conta cada etapa, e zero é zero", () => {
    const c = contarPorEtapa(
      montarFunil(
        [
          { ...base, id: "1", etapa: "esperar", simbolo: "a.us" },
          { ...base, id: "2", etapa: "esperar", simbolo: "b.us" },
          { ...base, id: "3", etapa: "comprada", simbolo: "c.us" },
        ],
        "2026-08-11",
      ),
    );
    expect(c.esperar).toBe(2);
    expect(c.comprada).toBe(1);
    expect(c.radar).toBe(0);
  });
});

describe("etapaSugerida", () => {
  it("sem veredicto fica em estudo, e não arquivada", () => {
    // Arquivar por falta de preço seria descartar uma empresa por causa de um
    // campo por preencher.
    expect(etapaSugerida(null)).toBe("estudo");
  });

  it("atrativa espera preço, não atrativa arquiva", () => {
    expect(etapaSugerida(true)).toBe("esperar");
    expect(etapaSugerida(false)).toBe("arquivada");
  });
});

describe("etapaValida", () => {
  it("recusa o que não é uma etapa", () => {
    expect(etapaValida("esperar")).toBe(true);
    expect(etapaValida("qualquer-coisa")).toBe(false);
    expect(etapaValida("")).toBe(false);
  });
});

describe("quantoFaltaDescer", () => {
  it("diz quanto o preço tem de cair para o estudo fazer sentido", () => {
    // De 400 para 300 são 25% abaixo.
    expect(quantoFaltaDescer(base)).toBe(25);
  });

  it("não responde quando o preço já lá está", () => {
    expect(quantoFaltaDescer({ ...base, precoNaAlturaCents: 250_00 })).toBeNull();
    expect(quantoFaltaDescer({ ...base, precoNaAlturaCents: null })).toBeNull();
  });
});

describe("lerCenarios", () => {
  const bom = [
    { id: "baixo", crescimentoPct: 6, crescimentoTardioPct: 5, probabilidadePct: 25 },
    { id: "medio", crescimentoPct: 9, crescimentoTardioPct: 7, probabilidadePct: 50 },
    { id: "alto", crescimentoPct: 15, crescimentoTardioPct: 9, probabilidadePct: 25 },
  ];

  it("lê o que está bem guardado", () => {
    expect(lerCenarios(bom)).toHaveLength(3);
    expect(lerCenarios(bom)![1]!.probabilidadePct).toBe(50);
  });

  /**
   * A razão de isto não ser um `as unknown as`. Um cenário sem probabilidade
   * entrava na média pesada como zero e desviava o preço ponderado, sem nada no
   * ecrã a dizê-lo.
   */
  it("recusa um cenário a que falta um campo", () => {
    expect(lerCenarios([{ id: "baixo", crescimentoPct: 6, crescimentoTardioPct: 5 }])).toBeNull();
  });

  it("recusa um número que não é número", () => {
    expect(
      lerCenarios([{ ...bom[0], probabilidadePct: "25" }]),
    ).toBeNull();
    expect(lerCenarios([{ ...bom[0], crescimentoPct: Number.NaN }])).toBeNull();
  });

  it("recusa um id que não é cenário nenhum", () => {
    expect(lerCenarios([{ ...bom[0], id: "outro" }])).toBeNull();
  });

  it("recusa o que nem sequer é uma lista", () => {
    expect(lerCenarios(null)).toBeNull();
    expect(lerCenarios("[]")).toBeNull();
    expect(lerCenarios([])).toBeNull();
    expect(lerCenarios([null])).toBeNull();
  });
});
