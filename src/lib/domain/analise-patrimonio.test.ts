import { describe, expect, it } from "vitest";
import { analisarPatrimonio, reforcosPorMes, type PontoMensal } from "./analise-patrimonio";
import type { Trade } from "./positions";

const t = (p: Partial<Trade> & { id: string; date: string; kind: Trade["kind"] }): Trade => ({
  quantity: p.quantity ?? null,
  unitPriceCents: p.unitPriceCents ?? null,
  amountCents: p.amountCents ?? 0,
  ...p,
});

const ponto = (mes: string, netCents: number, estimado?: boolean): PontoMensal => ({
  mes,
  netCents,
  ...(estimado ? { estimado: true } : {}),
});

describe("reforcosPorMes", () => {
  it("compras e custos somam, vendas subtraem", () => {
    const r = reforcosPorMes([
      t({ id: "1", date: "2026-03-04", kind: "compra", amountCents: 100_000 }),
      t({ id: "2", date: "2026-03-20", kind: "custo", amountCents: 500 }),
      t({ id: "3", date: "2026-03-25", kind: "venda", amountCents: 30_000 }),
    ]);
    expect(r.get("2026-03")).toEqual({ cents: 70_500, compras: 1 });
  });

  /**
   * Um dividendo é dinheiro que saiu do investimento para a conta. Contá-lo
   * como reforço negativo fazia um mês de dividendos parecer um mês de
   * resgates — o contrário do que aconteceu.
   */
  it("um dividendo não é um resgate", () => {
    const r = reforcosPorMes([
      t({ id: "1", date: "2026-03-04", kind: "dividendo", amountCents: 5_000 }),
    ]);
    expect(r.get("2026-03")?.cents).toBe(0);
  });
});

describe("analisarPatrimonio", () => {
  const serie = [ponto("2026-01", 100_000), ponto("2026-02", 150_000), ponto("2026-03", 140_000)];

  it("separa o que veio de reforços do que não veio", () => {
    const a = analisarPatrimonio(serie, [
      // Em fevereiro entraram 30 000 e o património subiu 50 000: 20 000 não
      // vieram de dinheiro novo.
      t({ id: "1", date: "2026-02-10", kind: "compra", amountCents: 30_000 }),
    ]);
    const fev = a.meses.find((m) => m.mes === "2026-02")!;
    expect(fev.variacaoCents).toBe(50_000);
    expect(fev.reforcoCents).toBe(30_000);
    expect(fev.semReforcosCents).toBe(20_000);
  });

  it("aponta o melhor e o pior mês", () => {
    const a = analisarPatrimonio(serie, []);
    expect(a.melhorMes?.mes).toBe("2026-02");
    expect(a.piorMes?.mes).toBe("2026-03");
  });

  it("o primeiro mês não tem variação, porque não há anterior", () => {
    const a = analisarPatrimonio(serie, []);
    expect(a.meses[0]!.variacaoCents).toBeNull();
    expect(a.mesesMedidos).toBe(2);
  });

  /**
   * Os pontos reconstruídos trazem o saldo de hoje das contas projetado para
   * trás. A variação entre dois deles é uma diferença entre estimativas.
   */
  it("um mês reconstruído não entra nas contas", () => {
    const a = analisarPatrimonio(
      [ponto("2026-01", 100_000, true), ponto("2026-02", 150_000, true), ponto("2026-03", 140_000)],
      [],
    );
    expect(a.mesesMedidos).toBe(0);
    expect(a.melhorMes).toBeNull();
    expect(a.mediaMensalCents).toBeNull();
  });

  it("o mês a seguir a um reconstruído também não conta", () => {
    // Comparar uma medição com uma estimativa mede a distância entre as duas.
    const a = analisarPatrimonio([ponto("2026-01", 100_000, true), ponto("2026-02", 150_000)], []);
    expect(a.meses[1]!.variacaoCents).toBeNull();
  });

  it("sem compras nenhumas não há mês com mais compras", () => {
    const a = analisarPatrimonio(serie, []);
    expect(a.mesComMaisCompras).toBeNull();
    expect(a.mesComMaiorReforco).toBeNull();
  });

  it("conta as compras de cada mês", () => {
    const a = analisarPatrimonio(serie, [
      t({ id: "1", date: "2026-02-10", kind: "compra", amountCents: 10_000 }),
      t({ id: "2", date: "2026-02-20", kind: "compra", amountCents: 10_000 }),
      t({ id: "3", date: "2026-03-01", kind: "compra", amountCents: 90_000 }),
    ]);
    expect(a.mesComMaisCompras?.mes).toBe("2026-02");
    expect(a.mesComMaiorReforco?.mes).toBe("2026-03");
  });

  it("a média mensal é sobre os meses medidos", () => {
    const a = analisarPatrimonio(serie, []);
    // +50 000 e -10 000 dão média de +20 000.
    expect(a.mediaMensalCents).toBe(20_000);
  });

  it("uma série vazia não inventa nada", () => {
    const a = analisarPatrimonio([], []);
    expect(a.melhorMes).toBeNull();
    expect(a.mediaMensalCents).toBeNull();
    expect(a.totalSemReforcosCents).toBeNull();
  });
});
