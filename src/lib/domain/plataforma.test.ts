import { describe, expect, it } from "vitest";
import {
  MINIMO_PARA_PERCENTAGEM,
  buildCrescimento,
  menosDias,
  type CrescimentoInput,
} from "./plataforma";

const HOJE = "2026-08-10";

function entrada(over: Partial<CrescimentoInput> = {}): CrescimentoInput {
  return {
    hoje: HOJE,
    contas: [],
    ambientes: [],
    eventos: [],
    ...over,
  };
}

describe("menosDias", () => {
  it("recua no calendário e não em meses de trinta dias", () => {
    expect(menosDias("2026-03-01", 1)).toBe("2026-02-28");
    expect(menosDias("2026-08-10", 30)).toBe("2026-07-11");
  });
});

describe("buildCrescimento: a série mensal", () => {
  it("mostra os meses pedidos, do mais antigo para o mais recente", () => {
    const c = buildCrescimento(entrada({ meses: 3 }));
    expect(c.meses.map((m) => m.mes)).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  /**
   * Uma série que salta os meses vazios desenha uma linha contínua por cima de
   * dois meses parados — que é exactamente a informação que se foi lá buscar.
   */
  it("não salta um mês sem nada", () => {
    const c = buildCrescimento(
      entrada({
        meses: 3,
        ambientes: [
          { id: "s1", createdAt: "2026-06-04T10:00:00Z" },
          { id: "s2", createdAt: "2026-08-01T10:00:00Z" },
        ],
      }),
    );
    expect(c.meses.map((m) => m.ambientesNovos)).toEqual([1, 0, 1]);
  });

  it("conta ambientes ativos por mês sem repetir o mesmo ambiente", () => {
    const c = buildCrescimento(
      entrada({
        meses: 2,
        eventos: [
          { spaceId: "s1", createdAt: "2026-08-02T09:00:00Z" },
          { spaceId: "s1", createdAt: "2026-08-03T09:00:00Z" },
          { spaceId: "s2", createdAt: "2026-08-04T09:00:00Z" },
        ],
      }),
    );
    const agosto = c.meses.at(-1)!;
    expect(agosto.registosNovos).toBe(3);
    expect(agosto.ambientesAtivos).toBe(2);
  });

  /**
   * A regra que faz a diferença entre uma curva verdadeira e a mais bonita das
   * mentiras: quem importa dois anos de extrato numa noite fez UMA noite de
   * uso. Se a série fosse construída sobre a data da transação, desenhava dois
   * anos de atividade a partir dessa noite.
   */
  it("um evento conta no mês em que ENTROU na app", () => {
    const c = buildCrescimento(
      entrada({
        meses: 2,
        // Um registo criado em agosto de 2026 — represente ele o que
        // representar, foi em agosto que alguém usou a app.
        eventos: [{ spaceId: "s1", createdAt: "2026-08-05T21:00:00Z" }],
      }),
    );
    expect(c.meses.map((m) => m.registosNovos)).toEqual([0, 1]);
  });
});

describe("buildCrescimento: janelas", () => {
  it("conta o que entrou em cada janela", () => {
    const c = buildCrescimento(
      entrada({
        // 10 de agosto menos 30 dias é 11 de julho: o do dia 20 entra na janela
        // de 30, o de 2025 não entra em nenhuma.
        contas: ["2026-08-09T10:00:00Z", "2026-07-20T10:00:00Z", "2025-01-01T10:00:00Z"],
        eventos: [
          { spaceId: "s1", createdAt: "2026-08-09T10:00:00Z" },
          { spaceId: "s2", createdAt: "2026-07-20T10:00:00Z" },
          { spaceId: "s3", createdAt: "2026-01-01T10:00:00Z" },
        ],
      }),
    );
    const [sete, trinta, noventa] = c.janelas;
    expect(sete!.contasNovas).toBe(1);
    expect(sete!.ambientesAtivos).toBe(1);
    expect(trinta!.contasNovas).toBe(2);
    expect(trinta!.ambientesAtivos).toBe(2);
    expect(noventa!.registosNovos).toBe(2);
  });
});

describe("buildCrescimento: retenção", () => {
  it("só conta ambientes que já tiveram tempo de voltar", () => {
    const c = buildCrescimento(
      entrada({
        ambientes: [
          { id: "velho", createdAt: "2026-01-01T10:00:00Z" },
          // Nasceu ontem: perguntar se voltou nos últimos 30 dias não faz
          // sentido nenhum, e contá-lo como perdido é caluniá-lo.
          { id: "ontem", createdAt: "2026-08-09T10:00:00Z" },
        ],
        eventos: [{ spaceId: "velho", createdAt: "2026-08-01T10:00:00Z" }],
      }),
    );
    expect(c.retencao.de).toBe(1);
    expect(c.retencao.quantos).toBe(1);
  });

  it("não dá percentagem quando a base é pequena de mais", () => {
    const c = buildCrescimento(
      entrada({ ambientes: [{ id: "a", createdAt: "2026-01-01T10:00:00Z" }] }),
    );
    // "0% de retenção" com um ambiente é verdade e não quer dizer nada.
    expect(c.retencao.pct).toBeNull();
  });

  it("dá percentagem assim que a base chega ao mínimo", () => {
    const ambientes = Array.from({ length: MINIMO_PARA_PERCENTAGEM }, (_, i) => ({
      id: `s${i}`,
      createdAt: "2026-01-01T10:00:00Z",
    }));
    const c = buildCrescimento(
      entrada({
        ambientes,
        eventos: [{ spaceId: "s0", createdAt: "2026-08-01T10:00:00Z" }],
      }),
    );
    expect(c.retencao.pct).toBe(20);
  });
});

describe("buildCrescimento: ativação", () => {
  it("conta a primeira semana a partir do nascimento, não do calendário", () => {
    const c = buildCrescimento(
      entrada({
        ambientes: [
          { id: "arrancou", createdAt: "2026-05-01T10:00:00Z" },
          { id: "adormecido", createdAt: "2026-05-01T10:00:00Z" },
        ],
        eventos: [
          { spaceId: "arrancou", createdAt: "2026-05-04T10:00:00Z" },
          // Só se lembrou dois meses depois: usou, mas não arrancou.
          { spaceId: "adormecido", createdAt: "2026-07-04T10:00:00Z" },
        ],
      }),
    );
    expect(c.ativacao.de).toBe(2);
    expect(c.ativacao.quantos).toBe(1);
  });

  it("um ambiente com menos de uma semana ainda não é julgado", () => {
    const c = buildCrescimento(
      entrada({ ambientes: [{ id: "novo", createdAt: "2026-08-08T10:00:00Z" }] }),
    );
    expect(c.ativacao.de).toBe(0);
  });
});

describe("buildCrescimento: ambientes sem nada", () => {
  it("conta os que nunca registaram coisa nenhuma", () => {
    const c = buildCrescimento(
      entrada({
        ambientes: [
          { id: "a", createdAt: "2026-01-01T10:00:00Z" },
          { id: "b", createdAt: "2026-01-01T10:00:00Z" },
        ],
        eventos: [{ spaceId: "a", createdAt: "2026-02-01T10:00:00Z" }],
      }),
    );
    expect(c.semQualquerRegisto).toBe(1);
  });
});
