import { describe, expect, it } from "vitest";
import { SECTIONS, isSectionActive, moreLinks, sectionOf } from "./nav";

describe("estrutura do menu", () => {
  it("tem quatro secções no topo, e só quatro", () => {
    // O ponto desta refactorização: o topo não pode crescer com as
    // funcionalidades. Se este teste falhar, é sinal de que se está a voltar a
    // pendurar páginas no menu principal.
    expect(SECTIONS).toHaveLength(4);
    expect(SECTIONS.map((s) => s.label)).toEqual([
      "Saldo",
      "Despesas",
      "Análise",
      "Património",
    ]);
  });

  it("importar e recorrentes vivem dentro de Despesas", () => {
    const despesas = SECTIONS.find((s) => s.label === "Despesas")!;
    expect(despesas.children?.map((c) => c.href)).toEqual([
      "/despesas",
      "/importar",
      "/recorrentes",
    ]);
  });
});

describe("Análise", () => {
  it("está dividida em vistas, em vez de um rolo só", () => {
    const analise = SECTIONS.find((s) => s.label === "Análise")!;
    expect(analise.children?.map((c) => c.label)).toEqual([
      "Resumo",
      "Categorias",
      "Evolução",
    ]);
  });
});

describe("Património", () => {
  it("separa as perguntas em vistas", () => {
    const pat = SECTIONS.find((s) => s.label === "Património")!;
    expect(pat.children?.map((c) => c.label)).toEqual([
      "Resumo",
      "Ativos",
      "Dívidas",
      "FIRE",
    ]);
  });
});

describe("isSectionActive", () => {
  it("acende a secção da própria página", () => {
    const saldo = SECTIONS[0]!;
    expect(isSectionActive(saldo, "/dashboard")).toBe(true);
    expect(isSectionActive(saldo, "/despesas")).toBe(false);
  });

  it("acende Despesas nas páginas que lhe pertencem", () => {
    const despesas = SECTIONS.find((s) => s.label === "Despesas")!;
    for (const p of ["/despesas", "/importar", "/recorrentes", "/aprovacoes"]) {
      expect(isSectionActive(despesas, p)).toBe(true);
    }
  });

  it("acende em subpáginas", () => {
    const despesas = SECTIONS.find((s) => s.label === "Despesas")!;
    expect(isSectionActive(despesas, "/despesas/nova")).toBe(true);
    expect(isSectionActive(despesas, "/despesas/abc/editar")).toBe(true);
  });

  it("não confunde prefixos parecidos", () => {
    const analise = SECTIONS.find((s) => s.label === "Análise")!;
    expect(isSectionActive(analise, "/relatorios-antigos")).toBe(false);
  });
});

describe("sectionOf", () => {
  it("encontra a secção da página", () => {
    expect(sectionOf("/importar")?.label).toBe("Despesas");
    expect(sectionOf("/patrimonio")?.label).toBe("Património");
  });

  it("devolve nada para páginas fora das secções", () => {
    expect(sectionOf("/mensagens")).toBeUndefined();
    expect(sectionOf("/acertos")).toBeUndefined();
  });
});

describe("moreLinks", () => {
  it("esconde as páginas de administração de quem não é admin", () => {
    const links = moreLinks({ isAdmin: false }).map((l) => l.href);
    expect(links).not.toContain("/plataforma");
    expect(links).not.toContain("/mensagens");
    expect(links).toContain("/acertos");
  });

  it("mostra-as ao admin", () => {
    const links = moreLinks({ isAdmin: true }).map((l) => l.href);
    expect(links).toContain("/plataforma");
    expect(links).toContain("/mensagens");
  });
});
