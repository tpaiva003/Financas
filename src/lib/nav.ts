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
 * O que é ocasional ou administrativo (ambiente, mensagens, consola) vive no
 * menu "Mais". Assim o topo fica estável mesmo que a app duplique de tamanho.
 *
 * **Dentro de uma secção, os separadores podem vir em blocos.** O Património
 * tinha sete seguidos e lia-se como uma lista de funcionalidades; são duas
 * perguntas diferentes — o que tenho hoje, e o que estou a decidir — e passam a
 * dizê-lo com um cabeçalho pequeno à frente de cada bloco (`grupo`).
 *
 * **E dois separadores nunca se chamam o mesmo.** Havia dois "Importar"
 * (extratos do banco, ficheiros da corretora) e dois "Despesas" (a lista, e a
 * análise de onde foi o dinheiro) em secções diferentes. O nome passa a dizer
 * o que é, para não haver que adivinhar pela secção onde se está.
 */

export interface NavItem {
  href: string;
  label: string;
  /** Páginas que pertencem a esta secção, para saber qual está ativa. */
  matches?: string[];
  /**
   * Cabeçalho do bloco a que este separador pertence, dentro da secção.
   *
   * Separadores seguidos com o mesmo `grupo` aparecem juntos, com o nome do
   * grupo à frente. Sem `grupo`, aparece solto — que é o que querem as secções
   * com três ou quatro páginas, onde um cabeçalho só acrescentaria ruído.
   */
  grupo?: string;
}

export interface NavSection extends NavItem {
  /** Páginas da secção, mostradas por dentro dela. */
  children?: NavItem[];
}

export const SECTIONS: NavSection[] = [
  {
    href: "/dashboard",
    label: "Saldo",
    /**
     * Os acertos vivem aqui, e não no menu "Mais".
     *
     * Fechar contas é a conclusão do saldo, não uma tarefa administrativa — e
     * estavam em dois sítios diferentes conforme o aparelho: na barra de baixo
     * do telemóvel, escondidos no "Mais" no computador. Quem usava os dois
     * aprendia dois mapas da mesma app.
     */
    matches: ["/dashboard", "/acertos"],
    children: [
      { href: "/dashboard", label: "Saldo" },
      { href: "/acertos", label: "Acertos" },
    ],
  },
  {
    href: "/despesas",
    // "Movimentos" e não "Despesas": desde que há rendimentos, a secção trata
    // do dinheiro nos dois sentidos, e chamar-lhe despesas escondia metade.
    label: "Movimentos",
    matches: ["/despesas", "/rendimentos", "/importar", "/recorrentes", "/aprovacoes"],
    children: [
      { href: "/despesas", label: "Despesas" },
      { href: "/rendimentos", label: "Rendimentos" },
      { href: "/importar", label: "Importar extrato" },
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
      { href: "/relatorios", label: "Em que gasto" },
      { href: "/relatorios/categorias", label: "Categorias" },
      { href: "/relatorios/evolucao", label: "Evolução" },
      { href: "/relatorios/patrimonio", label: "Carteira" },
    ],
  },
  {
    href: "/patrimonio",
    label: "Património",
    children: [
      { href: "/patrimonio", label: "Resumo", grupo: "O que tenho" },
      { href: "/patrimonio/ativos", label: "Ativos", grupo: "O que tenho" },
      { href: "/patrimonio/dividas", label: "Dívidas", grupo: "O que tenho" },
      { href: "/patrimonio/dcf", label: "Avaliação", grupo: "Decidir" },
      { href: "/patrimonio/avaliacoes", label: "Funil", grupo: "Decidir" },
      { href: "/patrimonio/fire", label: "FIRE", grupo: "Decidir" },
      /**
       * "Importar da corretora" sai daqui e passa a ser um botão nos Ativos.
       *
       * Não é um sítio onde se esteja: é uma coisa que se faz, uma vez de vez
       * em quando, e que acaba na lista de ativos. Como separador permanente
       * ocupava o mesmo peso visual que o Resumo, ao lado do qual se vê todos
       * os dias.
       */
    ],
  },
];

/** Páginas ocasionais ou de administração, fora do topo. */
export function moreLinks(options: { isAdmin: boolean }): NavItem[] {
  const links: NavItem[] = [
    // Os acertos subiram para dentro do Saldo: é lá que a pergunta nasce.
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
