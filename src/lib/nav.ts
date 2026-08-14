/**
 * Estrutura de navegação da app.
 *
 * O menu estava a crescer um item por cada funcionalidade nova (já eram nove) e
 * isso não escala: mais funcionalidades não podem significar mais escolhas à
 * frente de quem entra. Passa a haver QUATRO secções, por intenção, e cada uma
 * tem as suas páginas por dentro:
 *
 *   Saldo       quanto devo ou me devem, agora
 *   Despesas    registar e trazer despesas (lista, importar, recorrentes)
 *   Análise     olhar para trás (resumo, categorias, evolução)
 *   Património  o que tenho e para onde vou (bens, FIRE)
 *
 * O que é ocasional ou administrativo (acertos, ambiente, mensagens, consola)
 * vive no menu "Mais". Assim o topo fica estável mesmo que a app duplique de
 * tamanho.
 */

export interface NavItem {
  href: string;
  label: string;
  /** Páginas que pertencem a esta secção, para saber qual está ativa. */
  matches?: string[];
}

export interface NavSection extends NavItem {
  /** Páginas da secção, mostradas por dentro dela. */
  children?: NavItem[];
}

export const SECTIONS: NavSection[] = [
  { href: "/dashboard", label: "Saldo" },
  {
    href: "/despesas",
    // "Movimentos" e não "Despesas": desde que há rendimentos, a secção trata
    // do dinheiro nos dois sentidos, e chamar-lhe despesas escondia metade.
    label: "Movimentos",
    matches: ["/despesas", "/rendimentos", "/importar", "/recorrentes", "/aprovacoes"],
    children: [
      { href: "/despesas", label: "Despesas" },
      { href: "/rendimentos", label: "Rendimentos" },
      { href: "/importar", label: "Importar" },
      { href: "/recorrentes", label: "Recorrentes" },
    ],
  },
  {
    href: "/relatorios",
    label: "Análise",
    /**
     * Duas famílias de perguntas, e não uma lista de páginas.
     *
     * "Em que gasto" e "o que tenho a crescer" são perguntas diferentes, e
     * estavam todas debaixo de Análise sem distinção — o que fazia a segunda
     * não existir: quem entrava via só despesas e concluía que era isso.
     */
    children: [
      { href: "/relatorios", label: "Despesas" },
      { href: "/relatorios/categorias", label: "Categorias" },
      { href: "/relatorios/evolucao", label: "Evolução" },
      { href: "/relatorios/patrimonio", label: "Património" },
    ],
  },
  {
    href: "/patrimonio",
    label: "Património",
    children: [
      { href: "/patrimonio", label: "Resumo" },
      { href: "/patrimonio/ativos", label: "Ativos" },
      { href: "/patrimonio/dividas", label: "Dívidas" },
      { href: "/patrimonio/dcf", label: "Avaliação" },
      { href: "/patrimonio/avaliacoes", label: "Funil" },
      { href: "/patrimonio/fire", label: "FIRE" },
      { href: "/patrimonio/avaliacao", label: "Avaliação" },
      { href: "/patrimonio/importar", label: "Importar" },
    ],
  },
];

/** Páginas ocasionais ou de administração, fora do topo. */
export function moreLinks(options: { isAdmin: boolean }): NavItem[] {
  const links: NavItem[] = [
    { href: "/acertos", label: "Acertos" },
    { href: "/ambiente", label: "Ambiente" },
    // Para toda a gente, e não só para quem paga: pedir ajuda não é uma
    // funcionalidade, é a forma de dizer que alguma coisa está errada.
    { href: "/ajuda", label: "Ajuda" },
  ];
  if (options.isAdmin) {
    links.push({ href: "/mensagens", label: "Mensagens" });
    links.push({ href: "/plataforma", label: "Plataforma" });
  }
  return links;
}

/** Esta secção corresponde à página atual? */
export function isSectionActive(section: NavSection, pathname: string): boolean {
  const targets = section.matches ?? [section.href];
  return targets.some((t) => pathname === t || pathname.startsWith(`${t}/`));
}

/** Secção a que a página atual pertence, se alguma. */
export function sectionOf(pathname: string): NavSection | undefined {
  return SECTIONS.find((s) => isSectionActive(s, pathname));
}
