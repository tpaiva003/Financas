import { describe, expect, it } from "vitest";
import { streakDeRegistos } from "./streak";

const HOJE = "2026-08-18";

describe("streakDeRegistos", () => {
  it("sem registo nenhum não há streak", () => {
    const s = streakDeRegistos([], HOJE);
    expect(s).toEqual({ atual: 0, recorde: 0, registadoHoje: false });
  });

  it("conta os dias seguidos até hoje", () => {
    const s = streakDeRegistos(["2026-08-16", "2026-08-17", "2026-08-18"], HOJE);
    expect(s.atual).toBe(3);
    expect(s.registadoHoje).toBe(true);
  });

  // A regra que evita desmotivar quem vinha registar: às 00:01 o streak de
  // ontem ainda está vivo — só morre se o dia acabar sem registo.
  it("um dia ainda sem registo não perde o streak de ontem", () => {
    const s = streakDeRegistos(["2026-08-16", "2026-08-17"], HOJE);
    expect(s.atual).toBe(2);
    expect(s.registadoHoje).toBe(false);
  });

  it("dois dias sem registar perdem-no", () => {
    const s = streakDeRegistos(["2026-08-15", "2026-08-16"], HOJE);
    expect(s.atual).toBe(0);
  });

  it("um buraco no meio parte a sequência", () => {
    const s = streakDeRegistos(["2026-08-14", "2026-08-15", "2026-08-17", "2026-08-18"], HOJE);
    expect(s.atual).toBe(2);
  });

  it("o recorde vem do histórico, mesmo que a sequência atual seja menor", () => {
    const s = streakDeRegistos(
      ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-08-18"],
      HOJE,
    );
    expect(s.atual).toBe(1);
    expect(s.recorde).toBe(4);
  });

  it("dias repetidos contam uma vez (duas despesas no mesmo dia = um dia)", () => {
    const s = streakDeRegistos(["2026-08-18", "2026-08-18", "2026-08-17"], HOJE);
    expect(s.atual).toBe(2);
  });

  it("atravessa a virada do mês sem partir", () => {
    const s = streakDeRegistos(["2026-07-30", "2026-07-31", "2026-08-01"], "2026-08-01");
    expect(s.atual).toBe(3);
  });
});
