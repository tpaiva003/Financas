import { describe, it, expect } from "vitest";
import { nextOccurrence, enumerateDue, frequencyLabel } from "./recurring";

describe("nextOccurrence", () => {
  it("avança uma semana", () => {
    expect(nextOccurrence("2026-01-01", "weekly")).toBe("2026-01-08");
    expect(nextOccurrence("2026-01-29", "weekly")).toBe("2026-02-05");
  });

  it("avança um mês", () => {
    expect(nextOccurrence("2026-01-15", "monthly")).toBe("2026-02-15");
    expect(nextOccurrence("2026-12-15", "monthly")).toBe("2027-01-15");
  });

  it("fixa o dia ao último do mês quando não existe", () => {
    expect(nextOccurrence("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextOccurrence("2028-01-31", "monthly")).toBe("2028-02-29"); // bissexto
    expect(nextOccurrence("2026-03-31", "monthly")).toBe("2026-04-30");
  });

  it("avança um ano (com clamp em 29 fev)", () => {
    expect(nextOccurrence("2026-05-10", "yearly")).toBe("2027-05-10");
    expect(nextOccurrence("2028-02-29", "yearly")).toBe("2029-02-28");
  });
});

describe("enumerateDue", () => {
  it("não gera nada quando a próxima data é futura", () => {
    const r = enumerateDue({ nextDate: "2026-07-01", frequency: "monthly", asOf: "2026-06-30" });
    expect(r.occurrences).toEqual([]);
    expect(r.nextDate).toBe("2026-07-01");
    expect(r.finished).toBe(false);
  });

  it("gera as ocorrências em atraso até à data de referência", () => {
    const r = enumerateDue({ nextDate: "2026-01-10", frequency: "monthly", asOf: "2026-03-15" });
    expect(r.occurrences).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
    expect(r.nextDate).toBe("2026-04-10");
  });

  it("respeita a data de fim", () => {
    const r = enumerateDue({
      nextDate: "2026-01-10",
      frequency: "monthly",
      asOf: "2026-12-31",
      endDate: "2026-02-28",
    });
    expect(r.occurrences).toEqual(["2026-01-10", "2026-02-10"]);
    expect(r.finished).toBe(true);
  });

  it("gera semanais corretamente", () => {
    const r = enumerateDue({ nextDate: "2026-06-01", frequency: "weekly", asOf: "2026-06-22" });
    expect(r.occurrences).toEqual(["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"]);
  });

  it("respeita o limite de segurança (cap)", () => {
    const r = enumerateDue({ nextDate: "2020-01-01", frequency: "weekly", asOf: "2030-01-01", cap: 5 });
    expect(r.occurrences).toHaveLength(5);
  });
});

describe("frequencyLabel", () => {
  it("traduz para PT", () => {
    expect(frequencyLabel("monthly")).toBe("Mensal");
    expect(frequencyLabel("weekly")).toBe("Semanal");
    expect(frequencyLabel("yearly")).toBe("Anual");
  });
});
