import { describe, expect, it } from "vitest";
import { resumoDoTipo, type BemResumivel } from "./resumo-por-tipo";

/** Valores redondos e inventados: nada de dinheiro real, nem em teste. */
function bem(b: Partial<BemResumivel> & { kind: BemResumivel["kind"] }): BemResumivel {
  return { currentValueCents: 0, ...b };
}

describe("resumoDoTipo", () => {
  it("conta, soma e calcula o ganho de um tipo", () => {
    const r = resumoDoTipo("investimento", [
      bem({ kind: "investimento", currentValueCents: 12_000, quantity: 10, unitCostCents: 1_000 }),
      bem({ kind: "investimento", currentValueCents: 9_000, quantity: 10, unitCostCents: 1_000 }),
      bem({ kind: "conta", currentValueCents: 500_000 }),
    ]);
    expect(r.quantos).toBe(2);
    expect(r.valorCents).toBe(21_000);
    expect(r.custoCents).toBe(20_000);
    expect(r.ganhoCents).toBe(1_000);
    expect(r.ganhoPct).toBe(5);
  });

  /**
   * Uma conta bancária não tem "investido". Um zero ali lê-se como "não
   * ganhaste nada", quando o que se passa é que a pergunta não se aplica.
   */
  it("um tipo sem custo registado não tem custo nem ganho", () => {
    const r = resumoDoTipo("conta", [
      bem({ kind: "conta", currentValueCents: 500_000 }),
      bem({ kind: "conta", currentValueCents: 300_000 }),
    ]);
    expect(r.quantos).toBe(2);
    expect(r.valorCents).toBe(800_000);
    expect(r.custoCents).toBeNull();
    expect(r.ganhoCents).toBeNull();
    expect(r.ganhoPct).toBeNull();
  });

  /**
   * O investimento sem cotação conta pelo que custou. Deixá-lo entrar no ganho
   * dava um zero que baixa a percentagem de todos os outros — e ninguém
   * desconfia de uma percentagem.
   */
  it("quem não tem preço atual sai do ganho e é contado", () => {
    const r = resumoDoTipo("investimento", [
      bem({ kind: "investimento", currentValueCents: 15_000, quantity: 10, unitCostCents: 1_000 }),
      bem({
        kind: "investimento",
        currentValueCents: 10_000,
        quantity: 10,
        unitCostCents: 1_000,
        missingPrice: true,
      }),
    ]);
    expect(r.semPreco).toBe(1);
    // 15 000 sobre 10 000 de custo: só o que tem preço entra na conta.
    expect(r.ganhoCents).toBe(5_000);
    expect(r.ganhoPct).toBe(50);
    // O valor total continua a incluir os dois: o que falta é o ganho.
    expect(r.valorCents).toBe(25_000);
  });

  it("sem custo positivo não há percentagem de ganho", () => {
    const r = resumoDoTipo("investimento", [
      bem({ kind: "investimento", currentValueCents: 10_000, quantity: 0, unitCostCents: 0 }),
    ]);
    expect(r.ganhoCents).toBeNull();
    expect(r.ganhoPct).toBeNull();
  });

  it("um tipo sem bens nenhuns não rebenta", () => {
    const r = resumoDoTipo("imovel", []);
    expect(r.quantos).toBe(0);
    expect(r.valorCents).toBe(0);
    expect(r.custoCents).toBeNull();
    expect(r.ganhoPct).toBeNull();
  });

  it("uma perda é um ganho negativo, e não um ganho ausente", () => {
    const r = resumoDoTipo("investimento", [
      bem({ kind: "investimento", currentValueCents: 8_000, quantity: 10, unitCostCents: 1_000 }),
    ]);
    expect(r.ganhoCents).toBe(-2_000);
    expect(r.ganhoPct).toBe(-20);
  });
});
