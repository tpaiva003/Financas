import { describe, expect, it } from "vitest";
import {
  RETENTION_DAYS,
  WARN_BEFORE_DAYS,
  describeDaysLeft,
  retentionVerdict,
  type RetentionInput,
} from "@/lib/domain/retencao";

const HOJE = "2026-08-06";

/** Um ambiente gratuito com atividade há N dias. */
function comInatividade(dias: number, patch: Partial<RetentionInput> = {}): RetentionInput {
  const d = new Date(Date.parse(`${HOJE}T00:00:00Z`) - dias * 86_400_000);
  return {
    plan: "free",
    lastActivity: d.toISOString().slice(0, 10),
    createdAt: "2020-01-01",
    warnedAt: null,
    frozenAt: null,
    today: HOJE,
    ...patch,
  };
}

describe("retentionVerdict", () => {
  it("um ambiente com uso recente não é tocado", () => {
    const v = retentionVerdict(comInatividade(3));
    expect(v.state).toBe("ativo");
    expect(v.daysLeft).toBe(RETENTION_DAYS - 3);
  });

  it("avisa quando faltam duas semanas", () => {
    const v = retentionVerdict(comInatividade(RETENTION_DAYS - WARN_BEFORE_DAYS));
    expect(v.state).toBe("avisar");
    expect(v.daysLeft).toBe(WARN_BEFORE_DAYS);
  });

  it("não avisa antes da altura", () => {
    expect(retentionVerdict(comInatividade(RETENTION_DAYS - WARN_BEFORE_DAYS - 1)).state).toBe(
      "ativo",
    );
  });

  it("congela quando passa o prazo", () => {
    const v = retentionVerdict(
      comInatividade(RETENTION_DAYS + 1, { warnedAt: "2026-07-20" }),
    );
    expect(v.state).toBe("congelar");
  });

  it("congelar não é apagar: nunca há um estado que destrua", () => {
    // A garantia que sustenta a decisão de congelar em vez de apagar. Se alguém
    // acrescentar um estado destrutivo, este teste tem de falhar primeiro.
    const estados = [
      retentionVerdict(comInatividade(3)).state,
      retentionVerdict(comInatividade(RETENTION_DAYS - WARN_BEFORE_DAYS)).state,
      retentionVerdict(comInatividade(RETENTION_DAYS + 500)).state,
    ];
    expect(estados).toEqual(["ativo", "avisar", "congelar"]);
  });

  it("um ambiente completo nunca é tocado, por muito parado que esteja", () => {
    // A verificação do plano vem antes de qualquer conta de datas, para ser
    // impossível congelar um ambiente pago por um erro de aritmética.
    const v = retentionVerdict(
      comInatividade(RETENTION_DAYS * 10, { plan: "full", warnedAt: "2020-01-02" }),
    );
    expect(v.state).toBe("ativo");
  });

  it("sem plano definido assume-se gratuito, que é o mais restritivo a criar", () => {
    expect(retentionVerdict(comInatividade(3, { plan: undefined })).state).toBe("ativo");
  });

  it("sem atividade nenhuma conta desde a criação", () => {
    // Senão um ambiente criado e abandonado no mesmo dia ficava para sempre.
    const v = retentionVerdict({
      plan: "free",
      lastActivity: null,
      createdAt: "2020-01-01",
      warnedAt: null,
      frozenAt: null,
      today: HOJE,
    });
    expect(v.state).toBe("congelar");
    expect(v.daysInactive).toBeGreaterThan(RETENTION_DAYS);
  });

  it("no dia exato do prazo já congela", () => {
    const v = retentionVerdict(comInatividade(RETENTION_DAYS, { warnedAt: HOJE }));
    expect(v.state).toBe("congelar");
    expect(v.daysLeft).toBe(0);
  });

  it("datas estragadas não congelam nada por engano", () => {
    const v = retentionVerdict({
      plan: "free",
      lastActivity: "não é uma data",
      createdAt: "2020-01-01",
      warnedAt: null,
      frozenAt: null,
      today: HOJE,
    });
    // Sem conseguir medir, fica ativo: entre não mexer e bloquear por engano, a
    // escolha é óbvia.
    expect(v.state).toBe("ativo");
  });
});

/**
 * O que faltava para isto poder correr todos os dias sem se estragar a si
 * próprio, e o que o `RETOMAR.md` já dizia em falta: sem `frozenAt`, o veredito
 * não distinguia "há que congelar" de "já está congelado".
 */
describe("retentionVerdict, já congelado", () => {
  const CONGELOU_EM = "2026-05-01";

  it("não volta a congelar o que já está congelado", () => {
    // Contra a versão anterior isto dava "congelar" — todos os dias, para
    // sempre, reescrevendo a data em que o congelamento aconteceu.
    const v = retentionVerdict(
      comInatividade(RETENTION_DAYS + 30, { frozenAt: CONGELOU_EM }),
    );
    expect(v.state).toBe("congelado");
  });

  it("descongela quando houve vida depois do congelamento", () => {
    // A regra 3 a funcionar sem ninguém ter de pedir nada: a pessoa voltou há
    // três dias, e o ambiente congelou em maio.
    const v = retentionVerdict(comInatividade(3, { frozenAt: CONGELOU_EM }));
    expect(v.state).toBe("descongelar");
  });

  it("atividade no próprio dia do congelamento ainda não chega", () => {
    // A fronteira é estritamente depois: no dia em que congelou, a atividade
    // desse dia é a que já tinha sido contada para congelar.
    const v = retentionVerdict(
      comInatividade(RETENTION_DAYS + 1, { frozenAt: CONGELOU_EM, lastActivity: CONGELOU_EM }),
    );
    expect(v.state).toBe("congelado");
  });

  it("passar a pagar descongela, sem ter de voltar a entrar", () => {
    // Ficar bloqueado depois de pagar era o pior desfecho possível desta regra.
    const v = retentionVerdict(
      comInatividade(RETENTION_DAYS * 10, { plan: "full", frozenAt: CONGELOU_EM }),
    );
    expect(v.state).toBe("descongelar");
  });

  it("um ambiente completo que nunca congelou continua a não ser tocado", () => {
    expect(
      retentionVerdict(comInatividade(RETENTION_DAYS * 10, { plan: "full" })).state,
    ).toBe("ativo");
  });

  it("nenhum dos estados novos destrói nada", () => {
    // O mesmo compromisso do teste de cima, alargado aos estados novos: se
    // alguém acrescentar um estado que apague, este teste falha primeiro.
    const estados: string[] = [
      retentionVerdict(comInatividade(RETENTION_DAYS + 30, { frozenAt: CONGELOU_EM })).state,
      retentionVerdict(comInatividade(3, { frozenAt: CONGELOU_EM })).state,
    ];
    expect(estados).toEqual(["congelado", "descongelar"]);
  });
});

describe("describeDaysLeft", () => {
  it("fala como uma pessoa", () => {
    expect(describeDaysLeft(14)).toBe("daqui a 14 dias");
    expect(describeDaysLeft(1)).toBe("amanhã");
    expect(describeDaysLeft(0)).toBe("hoje");
    expect(describeDaysLeft(-5)).toBe("hoje");
  });
});
