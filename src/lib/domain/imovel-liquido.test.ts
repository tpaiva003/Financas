import { describe, expect, it } from "vitest";
import { liquidoPorBem } from "./imovel-liquido";

const casa = { id: "casa", name: "Apartamento", valueCents: 300_000_00 };

describe("liquidoPorBem", () => {
  it("subtrai o crédito ao valor do bem", () => {
    const r = liquidoPorBem(
      [casa],
      [{ id: "c1", name: "Crédito habitação", balanceCents: 200_000_00, financesAssetId: "casa" }],
    );
    expect(r.get("casa")?.liquidoCents).toBe(100_000_00);
    expect(r.get("casa")?.pagoPct).toBe(33);
  });

  it("soma os créditos quando há mais do que um", () => {
    // O da compra e o das obras: um imóvel pode ter dois, e é por isso que o
    // campo vive na dívida e não no bem.
    const r = liquidoPorBem(
      [casa],
      [
        { id: "c1", name: "Compra", balanceCents: 180_000_00, financesAssetId: "casa" },
        { id: "c2", name: "Obras", balanceCents: 20_000_00, financesAssetId: "casa" },
      ],
    );
    expect(r.get("casa")?.dividaCents).toBe(200_000_00);
    expect(r.get("casa")?.creditos).toHaveLength(2);
  });

  it("um bem sem crédito não entra", () => {
    // Dizer "líquido igual ao valor" numa conta a prazo é ruído.
    expect(liquidoPorBem([casa], []).size).toBe(0);
  });

  it("um crédito sem bem ligado não entra em conta nenhuma", () => {
    const r = liquidoPorBem([casa], [{ id: "c1", name: "Cartão", balanceCents: 5_000_00 }]);
    expect(r.size).toBe(0);
  });

  it("dever mais do que a casa vale dá líquido negativo, e não zero", () => {
    // Acontece nos primeiros anos de um crédito, e é informação: escondê-lo
    // atrás de um zero era esconder que se deve mais do que se tem.
    const r = liquidoPorBem(
      [casa],
      [{ id: "c1", name: "Crédito", balanceCents: 350_000_00, financesAssetId: "casa" }],
    );
    expect(r.get("casa")?.liquidoCents).toBe(-50_000_00);
    // A fatia paga não vai a negativo: "−17% pago" não quer dizer nada.
    expect(r.get("casa")?.pagoPct).toBe(0);
  });

  it("sem valor do bem não se inventa uma fatia", () => {
    const r = liquidoPorBem(
      [{ id: "casa", name: "Apartamento", valueCents: 0 }],
      [{ id: "c1", name: "Crédito", balanceCents: 100_00, financesAssetId: "casa" }],
    );
    expect(r.get("casa")?.pagoPct).toBeNull();
  });
});
