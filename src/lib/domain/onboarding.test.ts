import { describe, expect, it } from "vitest";
import { buildOnboarding, type OnboardingFacts } from "./onboarding";

const vazio: OnboardingFacts = {
  expenseCount: 0,
  memberCount: 1,
  importCount: 0,
  incomeCount: 0,
};

describe("buildOnboarding", () => {
  it("começa com tudo por fazer", () => {
    const o = buildOnboarding(vazio);
    expect(o.doneCount).toBe(0);
    expect(o.complete).toBe(false);
    expect(o.next?.id).toBe("despesa");
  });

  it("completa-se sozinho a partir dos dados", () => {
    // Não há nada para marcar como feito: regista-se uma despesa e pronto.
    const o = buildOnboarding({ ...vazio, expenseCount: 1 });
    expect(o.steps.find((s) => s.id === "despesa")!.done).toBe(true);
    expect(o.next?.id).toBe("pessoas");
  });

  it("estar sozinho no ambiente não conta como ter pessoas", () => {
    expect(buildOnboarding({ ...vazio, memberCount: 1 }).steps[1]!.done).toBe(false);
    expect(buildOnboarding({ ...vazio, memberCount: 2 }).steps[1]!.done).toBe(true);
  });

  it("fica completo quando está tudo feito", () => {
    const o = buildOnboarding({
      expenseCount: 3,
      memberCount: 2,
      importCount: 1,
      incomeCount: 1,
    });
    expect(o.complete).toBe(true);
    expect(o.next).toBeNull();
    expect(o.doneCount).toBe(o.total);
  });

  it("aponta sempre para o primeiro passo em falta", () => {
    const o = buildOnboarding({ ...vazio, expenseCount: 5, memberCount: 3 });
    expect(o.next?.id).toBe("importar");
  });

  it("cada passo leva a algum lado", () => {
    // Um passo sem destino é um passo inútil.
    for (const s of buildOnboarding(vazio).steps) {
      expect(s.href.startsWith("/")).toBe(true);
      expect(s.cta.length).toBeGreaterThan(0);
    }
  });
});
