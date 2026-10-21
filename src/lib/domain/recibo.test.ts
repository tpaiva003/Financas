/**
 * A revisão determinística da leitura de recibos.
 *
 * O modelo propõe; ISTO decide. Os casos aqui são os que transformariam uma
 * leitura em números errados nas contas de alguém: moeda estrangeira gravada
 * como euros, datas do futuro, o clássico do vírgula flutuante nos cêntimos.
 */

import { describe, expect, it } from "vitest";
import { reviewRecibo, type ReciboLido } from "./recibo";

const HOJE = "2026-08-18";

function lida(extra: Partial<ReciboLido>): ReciboLido {
  return {
    encontrado: true,
    totalEur: 12.34,
    moeda: "EUR",
    data: "2026-08-17",
    comerciante: "Continente Bom Dia",
    notas: "Talão de supermercado.",
    ...extra,
  };
}

describe("reviewRecibo", () => {
  it("uma leitura limpa vira proposta com os cêntimos exatos", () => {
    const r = reviewRecibo(lida({}), HOJE);
    expect(r.problema).toBeNull();
    expect(r.proposta).toEqual({
      amountCents: 1234,
      description: "Continente Bom Dia",
      date: "2026-08-17",
      avisos: [],
    });
  });

  it("4,20 € são 420 cêntimos, não 419", () => {
    // 4.2 * 100 === 419.99999999999994: sem arredondar, o recibo perdia um cêntimo.
    const r = reviewRecibo(lida({ totalEur: 4.2 }), HOJE);
    expect(r.proposta?.amountCents).toBe(420);
  });

  it("moeda estrangeira recusa: sem taxa de câmbio não se grava preço nenhum", () => {
    const r = reviewRecibo(lida({ moeda: "outra" }), HOJE);
    expect(r.proposta).toBeNull();
    expect(r.problema).toMatch(/taxa de câmbio/);
  });

  it("uma data no futuro não entra: fica aviso e a data vazia", () => {
    const r = reviewRecibo(lida({ data: "2027-01-01" }), HOJE);
    expect(r.proposta?.date).toBeNull();
    expect(r.proposta?.avisos.join(" ")).toMatch(/futuro/);
  });

  it("uma data que não é data fica de fora, com aviso", () => {
    const r = reviewRecibo(lida({ data: "2026-02-30" }), HOJE);
    expect(r.proposta?.date).toBeNull();
    expect(r.proposta?.avisos.length).toBeGreaterThan(0);
  });

  it("sem total legível não há proposta nenhuma", () => {
    for (const totalEur of [null, 0, -3.5, Number.NaN]) {
      const r = reviewRecibo(lida({ totalEur }), HOJE);
      expect(r.proposta, String(totalEur)).toBeNull();
    }
  });

  it("um total absurdo recusa em vez de propor", () => {
    const r = reviewRecibo(lida({ totalEur: 1_000_000 }), HOJE);
    expect(r.proposta).toBeNull();
    expect(r.problema).toMatch(/grande de mais/);
  });

  it("o que não é um recibo devolve o motivo do modelo", () => {
    const r = reviewRecibo(lida({ encontrado: false, notas: "É um cartaz de cinema." }), HOJE);
    expect(r.proposta).toBeNull();
    expect(r.problema).toBe("É um cartaz de cinema.");
  });

  it("sem nome de loja a descrição não fica vazia", () => {
    const r = reviewRecibo(lida({ comerciante: "  " }), HOJE);
    expect(r.proposta?.description).toBe("Recibo");
  });
});
