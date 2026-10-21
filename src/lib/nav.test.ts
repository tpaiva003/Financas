import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("os acertos vivem dentro do Saldo, e não no menu Mais", () => {
    /**
     * Fechar contas é a conclusão do saldo, não uma tarefa administrativa — e
     * estava em dois sítios diferentes conforme o aparelho: um botão na barra
     * de baixo do telemóvel, escondido dentro do "Mais" no computador. Quem
     * usava os dois aprendia dois mapas da mesma app.
     */
    const saldo = SECTIONS.find((s) => s.label === "Saldo")!;
    expect(saldo.children?.map((c) => c.href)).toEqual(["/dashboard", "/acertos"]);
    expect(isSectionActive(saldo, "/acertos")).toBe(true);
    expect(moreLinks({ isAdmin: false }).map((l) => l.href)).not.toContain("/acertos");
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
      // "Em que gasto" e não "Despesas": havia um separador "Despesas" aqui e
      // outro nos Movimentos, e a diferença entre eles — a lista e a análise —
      // não estava em nenhum dos dois nomes.
      "Em que gasto",
      "Categorias",
      "Evolução",
      // As despesas e o património respondem a perguntas diferentes, e antes
      // estavam todas debaixo de Análise sem distinção — o que fazia a segunda
      // não existir: quem entrava via só despesas e concluía que era isso.
      "Carteira",
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
      "Funil",
      "FIRE",
    ]);
  });

  it("os separadores vêm em dois blocos, e não numa fila de sete", () => {
    /**
     * Sete separadores seguidos lêem-se como uma lista de funcionalidades. São
     * duas perguntas diferentes — o que tenho hoje, e o que estou a decidir —
     * e é isso que o `grupo` diz, com um cabeçalho pequeno à frente de cada
     * bloco.
     */
    const pat = SECTIONS.find((s) => s.label === "Património")!;
    expect(pat.children?.map((c) => c.grupo)).toEqual([
      "O que tenho",
      "O que tenho",
      "O que tenho",
      "Decidir",
      "Decidir",
      "Decidir",
    ]);
  });

  it("os separadores de um bloco estão todos seguidos", () => {
    // O `SectionNav` desenha um cabeçalho a cada mudança de grupo: um grupo
    // interrompido e retomado aparecia duas vezes, com o mesmo nome.
    for (const s of SECTIONS) {
      const grupos = (s.children ?? []).map((c) => c.grupo ?? null);
      const blocos = grupos.filter((g, i) => g !== grupos[i - 1]);
      const nomeados = blocos.filter((g): g is string => g !== null);
      expect(new Set(nomeados).size, `${s.label}: grupo interrompido`).toBe(nomeados.length);
    }
  });

  it("'Importar da corretora' sai dos separadores", () => {
    // Não é um sítio onde se esteja: é uma coisa que se faz de vez em quando e
    // que acaba na lista de ativos. Passou a ser um link lá, e como separador
    // permanente pesava o mesmo que o Resumo, ao lado do qual se vê todos os
    // dias. A página continua a existir — o que sai é o separador.
    const hrefs = SECTIONS.flatMap((s) => s.children ?? []).map((c) => c.href);
    expect(hrefs).not.toContain("/patrimonio/importar");
  });
});

describe("dois separadores com o mesmo nome", () => {
  /**
   * O Património teve durante meses **dois separadores chamados "Avaliação"**,
   * lado a lado, os dois a avaliar empresas por fluxos de caixa — um guardava o
   * estudo, o outro era uma folha de rascunho. De fora não havia como saber
   * qual era qual, e carregar no errado perdia o trabalho ao fechar o separador.
   *
   * O teste que havia listava os nomes à mão, e por isso **tinha o duplicado lá
   * escrito**: passava a verde com o problema à vista. A regra é esta, e é ela
   * que falha sozinha da próxima vez.
   */
  it("não existem, dentro da mesma secção", () => {
    const repetidos: string[] = [];
    for (const s of SECTIONS) {
      const vistos = new Set<string>();
      for (const c of s.children ?? []) {
        if (vistos.has(c.label)) repetidos.push(`${s.label} → ${c.label}`);
        vistos.add(c.label);
      }
    }
    expect(repetidos, `separadores repetidos: ${repetidos.join(", ")}`).toEqual([]);
  });

  it("nem em secções diferentes", () => {
    /**
     * Havia dois "Importar" (extratos do banco, ficheiros da corretora) e dois
     * "Despesas" (a lista, e a análise de onde foi o dinheiro), em secções
     * diferentes. Quem só lê o separador — que é quem está a procurar — tinha
     * de adivinhar pela secção onde estava, e as duas estão a um clique uma da
     * outra. O nome tem de dizer o que é, sozinho.
     */
    const porLabel = new Map<string, string[]>();
    for (const s of SECTIONS) {
      for (const c of s.children ?? []) {
        // O separador raiz repete o nome da secção de propósito ("Saldo" dentro
        // de "Saldo"): é a mesma página, não duas coisas com o mesmo nome.
        if (c.href === s.href) continue;
        porLabel.set(c.label, [...(porLabel.get(c.label) ?? []), s.label]);
      }
    }
    const repetidos = [...porLabel].filter(([, onde]) => onde.length > 1);
    expect(
      repetidos.map(([label, onde]) => `${label} (${onde.join(", ")})`),
      "o mesmo nome em secções diferentes",
    ).toEqual([]);
  });

  it("nem dois separadores a apontar para o mesmo sítio", () => {
    const repetidos: string[] = [];
    for (const s of SECTIONS) {
      const vistos = new Set<string>();
      for (const c of s.children ?? []) {
        if (vistos.has(c.href)) repetidos.push(`${s.label} → ${c.href}`);
        vistos.add(c.href);
      }
    }
    expect(repetidos).toEqual([]);
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

  it("encontra os acertos dentro do Saldo", () => {
    expect(sectionOf("/acertos")?.label).toBe("Saldo");
  });

  it("devolve nada para páginas fora das secções", () => {
    expect(sectionOf("/mensagens")).toBeUndefined();
    expect(sectionOf("/ambiente")).toBeUndefined();
  });
});

describe("moreLinks", () => {
  it("esconde as páginas de administração de quem não é admin", () => {
    const links = moreLinks({ isAdmin: false }).map((l) => l.href);
    expect(links).not.toContain("/plataforma");
    expect(links).not.toContain("/mensagens");
    expect(links).toContain("/ajuda");
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

/**
 * A barra de baixo do telemóvel e o topo do computador dizem o mesmo.
 *
 * O comentário no `layout.tsx` já afirmava isto — "as mesmas secções do topo,
 * para o mapa mental ser um só" — e por baixo dele havia um quinto botão
 * ("Acertos") que no computador estava escondido dentro do menu "Mais". Quem
 * usava os dois aparelhos aprendia dois mapas da mesma app, e o comentário
 * garantia que ninguém ia conferir.
 *
 * É um teste de código-fonte porque o layout é um componente de servidor que
 * lê a sessão e o ambiente: renderizá-lo aqui custava mais do que o que
 * protege, e o que se quer verificar é a lista, não o HTML.
 */
describe("a barra do telemóvel espelha as secções do topo", () => {
  const layout = readFileSync(join(process.cwd(), "src", "app", "(app)", "layout.tsx"), "utf8");
  /** Os botões da barra, sem o caso do submitter (que só vê despesas). */
  const hrefs = [...layout.matchAll(/<BottomLink\s+href="([^"]+)"/g)].map((m) => m[1]!);

  it("encontra os botões (senão isto não testa nada)", () => {
    expect(hrefs.length).toBeGreaterThan(4);
  });

  it("não tem destinos fora das secções", () => {
    const seccoes = new Set(SECTIONS.map((s) => s.href));
    const fora = [...new Set(hrefs)].filter((h) => !seccoes.has(h));
    expect(fora, `na barra de baixo e em secção nenhuma: ${fora.join(", ")}`).toEqual([]);
  });

  it("não tem mais botões do que secções", () => {
    // Cinco não cabem a 360 px sem o texto encavalitar, e o quinto era sempre
    // o que não existia no computador.
    expect(new Set(hrefs).size).toBeLessThanOrEqual(SECTIONS.length);
  });
});
