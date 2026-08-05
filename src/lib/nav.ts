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
    label: "Despesas",
    matches: ["/despesas", "/importar", "/recorrentes", "/aprovacoes"],
    children: [
      { href: "/despesas", label: "Lista" },
      { href: "/importar", label: "Importar" },
      { href: "/recorrentes", label: "Recorrentes" },
    ],
  },
  {
    href: "/relatorios",
    label: "Análise",
    children: [
      { href: "/relatorios", label: "Resumo" },
      { href: "/relatorios/categorias", label: "Categorias" },
      { href: "/relatorios/evolucao", label: "Evolução" },
    ],
  },
  { href: "/patrimonio", label: "Património" },
];

/** Páginas ocasionais ou de administração, fora do topo. */
export function moreLinks(options: { isAdmin: boolean }): NavItem[] {
  const links: NavItem[] = [
    { href: "/acertos", label: "Acertos" },
    { href: "/ambiente", label: "Ambiente" },
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
