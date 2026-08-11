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
      "Movimentos",
      "Análise",
      "Património",
    ]);
  });

  it("despesas e rendimentos vivem juntos, nos movimentos", () => {
    // O dinheiro anda nos dois sentidos: separá-los em secções diferentes
    // obrigava a saltar de sítio para ver a mesma história.
    const mov = SECTIONS.find((s) => s.label === "Movimentos")!;
    expect(mov.children?.map((c) => c.href)).toEqual([
      "/despesas",
      "/rendimentos",
      "/importar",
      "/recorrentes",
    ]);
  });
});

describe("Análise", () => {
  it("está dividida em vistas, em vez de um rolo só", () => {
    const analise = SECTIONS.find((s) => s.label === "Análise")!;
    expect(analise.children?.map((c) => c.label)).toEqual([
      "Despesas",
      "Categorias",
      "Evolução",
      // As despesas e o património respondem a perguntas diferentes, e antes
      // estavam todas debaixo de Análise sem distinção — o que fazia a segunda
      // não existir: quem entrava via só despesas e concluía que era isso.
      "Património",
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
      "Avaliação",
      "FIRE",
      "Importar",
    ]);
  });
});

describe("isSectionActive", () => {
  it("acende a secção da própria página", () => {
    const saldo = SECTIONS[0]!;
    expect(isSectionActive(saldo, "/dashboard")).toBe(true);
    expect(isSectionActive(saldo, "/despesas")).toBe(false);
  });

  it("acende Movimentos nas páginas que lhe pertencem", () => {
    const despesas = SECTIONS.find((s) => s.label === "Movimentos")!;
    for (const p of ["/despesas", "/rendimentos", "/importar", "/recorrentes", "/aprovacoes"]) {
      expect(isSectionActive(despesas, p)).toBe(true);
    }
  });

  it("acende em subpáginas", () => {
    const despesas = SECTIONS.find((s) => s.label === "Movimentos")!;
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
    expect(sectionOf("/importar")?.label).toBe("Movimentos");
    expect(sectionOf("/rendimentos")?.label).toBe("Movimentos");
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

/**
 * O separador raiz de uma secção não pode ficar aceso quando se está numa
 * página de dentro dela. Acontecia com o "Resumo" do património: em
 * `/patrimonio/dividas` ficavam dois separadores acesos, e carregar no Resumo
 * não movia o destaque — lia-se como um botão avariado, quando a navegação
 * funcionava e era a marcação que mentia.
 */
describe("separador raiz de uma secção", () => {
  /** A mesma regra que o `SectionNav` aplica. */
  function ativo(childHref: string, sectionHref: string, pathname: string): boolean {
    return childHref === sectionHref
      ? pathname === childHref
      : pathname === childHref || pathname.startsWith(`${childHref}/`);
  }

  it("o Resumo só está aceso na raiz", () => {
    expect(ativo("/patrimonio", "/patrimonio", "/patrimonio")).toBe(true);
    expect(ativo("/patrimonio", "/patrimonio", "/patrimonio/dividas")).toBe(false);
  });

  it("um separador de dentro continua aceso nas suas subpáginas", () => {
    expect(ativo("/patrimonio/ativos", "/patrimonio", "/patrimonio/ativos/abc")).toBe(true);
  });

  it("nunca há dois acesos ao mesmo tempo", () => {
    const filhos = ["/patrimonio", "/patrimonio/ativos", "/patrimonio/dividas"];
    for (const pathname of ["/patrimonio", "/patrimonio/dividas", "/patrimonio/ativos/abc"]) {
      const acesos = filhos.filter((f) => ativo(f, "/patrimonio", pathname));
      expect(acesos).toHaveLength(1);
    }
  });
});
