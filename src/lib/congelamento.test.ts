import { describe, expect, it } from "vitest";
import { ESCRITA_CONGELADA, congelado, precisaDeMarcarAtividade } from "./congelamento";

describe("congelado", () => {
  it("um ambiente com data de congelamento está congelado", () => {
    expect(congelado({ plan: "free", frozenAt: "2026-05-01T00:00:00Z" })).toBe(true);
  });

  it("sem data não está congelado", () => {
    expect(congelado({ plan: "free", frozenAt: null })).toBe(false);
    expect(congelado({ plan: "free", frozenAt: undefined })).toBe(false);
  });

  /**
   * A regra 1 do `domain/retencao.ts`, aplicada também do lado de quem lê o
   * estado: um ambiente completo nunca fica bloqueado, nem por um `frozen_at`
   * antigo esquecido de quando era gratuito. Sem isto, quem passasse a pagar
   * continuava sem poder escrever até um cron correr.
   */
  it("um ambiente completo nunca está congelado, mesmo com data antiga", () => {
    expect(congelado({ plan: "full", frozenAt: "2026-05-01T00:00:00Z" })).toBe(false);
  });

  it("sem plano definido assume-se gratuito", () => {
    expect(congelado({ plan: undefined, frozenAt: "2026-05-01T00:00:00Z" })).toBe(true);
  });

  it("a mensagem diz o que aconteceu, que nada se perdeu, e o que fazer", () => {
    // "Sem permissão" seria verdade e não servia de nada.
    expect(ESCRITA_CONGELADA).toContain("congelado");
    expect(ESCRITA_CONGELADA).toContain("Nada foi apagado");
    expect(ESCRITA_CONGELADA).toContain("Reativar");
  });
});

describe("precisaDeMarcarAtividade", () => {
  it("marca quando nunca se marcou", () => {
    expect(precisaDeMarcarAtividade(null, "2026-08-15T10:00:00Z")).toBe(true);
    expect(precisaDeMarcarAtividade(undefined, "2026-08-15T10:00:00Z")).toBe(true);
  });

  /**
   * O que impede uma ida à base de dados em cada página aberta. A retenção
   * conta dias; gravar o mesmo dia dez vezes não acrescenta informação nenhuma
   * e paga-se em todos os pedidos.
   */
  it("não volta a marcar no mesmo dia", () => {
    expect(precisaDeMarcarAtividade("2026-08-15T08:00:00Z", "2026-08-15T23:59:00Z")).toBe(false);
  });

  it("marca quando o dia muda", () => {
    expect(precisaDeMarcarAtividade("2026-08-14T23:59:00Z", "2026-08-15T00:01:00Z")).toBe(true);
  });

  /**
   * Uma data no futuro não faz marcar para trás. Acontece com relógios
   * desalinhados, e o pior que pode dar é uma marcação a menos.
   */
  it("uma data no futuro não faz marcar", () => {
    expect(precisaDeMarcarAtividade("2026-09-01T00:00:00Z", "2026-08-15T10:00:00Z")).toBe(false);
  });
});
