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
      today: HOJE,
    });
    // Sem conseguir medir, fica ativo: entre não mexer e bloquear por engano, a
    // escolha é óbvia.
    expect(v.state).toBe("ativo");
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
