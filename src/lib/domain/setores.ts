/**
 * A carteira vista por setor: a que é que este dinheiro está exposto.
 *
 * **A pergunta que uma lista de investimentos não responde.** Doze linhas
 * diferentes parecem doze apostas diferentes, e podem ser doze apostas na mesma
 * coisa. Uma carteira que se sente diversificada por ter muitos nomes é o engano
 * mais caro que uma lista consegue produzir — e o número que o desfaz é sempre o
 * mesmo: quanto por cento está no maior setor.
 *
 * **"Por classificar" é um grupo com nome, e nunca uma fatia calada.** Se
 * metade da carteira não tem setor, a percentagem do maior setor está errada
 * por metade, e um gráfico que só desenhe os classificados esconde exactamente
 * isso. Por isso os que faltam contam, aparecem, e o ecrã diz quantos são.
 *
 * **O dinheiro que entrou e o que a posição vale hoje são duas leituras
 * diferentes, e as duas fazem falta.** Uma diz onde é que se decidiu pôr o
 * dinheiro; a outra diz onde é que ele está agora. Um setor que subiu muito
 * ocupa mais peso do que alguma vez se decidiu dar-lhe, e é assim que uma
 * concentração aparece sem ninguém a ter escolhido.
 *
 * Lógica pura, sem acesso a dados.
 */

/** O rótulo dos que ainda não têm setor. Nunca é uma fatia calada. */
export const SEM_SETOR = "Por classificar";

/**
 * Os nomes que o Yahoo usa, em português.
 *
 * **Um nome que não esteja aqui passa como está, em vez de desaparecer.** A
 * fonte estreia classificações de vez em quando, e a alternativa — cair tudo o
 * que não se reconhece em "Outros" — juntava numa fatia só coisas que não têm
 * nada a ver umas com as outras, e ninguém dava por isso.
 */
export const SETORES_PT: Readonly<Record<string, string>> = {
  Technology: "Tecnologia",
  "Financial Services": "Serviços financeiros",
  Financial: "Serviços financeiros",
  Healthcare: "Saúde",
  "Consumer Cyclical": "Consumo cíclico",
  "Consumer Defensive": "Consumo básico",
  "Communication Services": "Comunicações",
  Industrials: "Indústria",
  Energy: "Energia",
  Utilities: "Utilities",
  "Basic Materials": "Materiais",
  "Real Estate": "Imobiliário",
};

/** O setor como se lê em português, ou como veio se não se reconhecer. */
export function setorPorExtenso(bruto: string | null | undefined): string {
  const s = (bruto ?? "").trim();
  if (!s) return SEM_SETOR;
  return SETORES_PT[s] ?? s;
}

/** Uma posição, com o que basta para a repartir por setor. */
export interface PosicaoDoSetor {
  id: string;
  nome: string;
  setor: string | null;
  /** Ação, fundo ou outra coisa, como a fonte lhe chama. Ver `tipoPorExtenso`. */
  instrumento?: string | null;
  /** Quanto vale hoje. */
  valorCents: number;
  /** Quanto custou o que ainda se tem. */
  custoCents: number;
  /** Dinheiro que entrou nesta posição ao longo do tempo — compras e custos. */
  reforcoCents: number;
}

export interface GrupoDeSetor {
  /**
   * A etiqueta do grupo: o setor, ou o tipo de instrumento.
   *
   * Chamava-se `setor` quando só havia uma forma de repartir a carteira. A
   * conta é a mesma para as duas — somar o valor, o custo e o reforço de um
   * punhado de posições e dividir pelo total — e duplicá-la para lhe chamar
   * outro nome era duplicar também o sítio onde ela pode passar a estar errada.
   */
  nome: string;
  /** `true` no grupo dos que ainda não têm setor. */
  porClassificar: boolean;
  valorCents: number;
  custoCents: number;
  reforcoCents: number;
  /** Peso no valor de hoje, em percentagem com uma casa. */
  pesoPct: number;
  /**
   * Peso no dinheiro que entrou, em percentagem.
   *
   * `null` quando não entrou dinheiro nenhum — dividir por zero daria um peso
   * infinito num setor onde não se decidiu nada.
   */
  pesoDoReforcoPct: number | null;
  /**
   * Ganho sobre o custo das posições abertas.
   *
   * `null` sem custo positivo: um ganho percentual sobre custo zero não é um
   * número, é uma divisão que correu mal.
   */
  ganhoCents: number | null;
  ganhoPct: number | null;
  /** As posições deste setor, da maior para a menor. */
  posicoes: PosicaoDoSetor[];
}

export interface CarteiraPorSetor {
  grupos: GrupoDeSetor[];
  valorTotalCents: number;
  reforcoTotalCents: number;
  /** O maior setor, que é o número que desfaz a sensação de diversificação. */
  maior: GrupoDeSetor | null;
  /** Quantas posições ainda não têm setor. Zero quando está tudo classificado. */
  porClassificar: number;
  /**
   * Quanto do valor não está classificado, em percentagem.
   *
   * Existe para o ecrã poder dizer o que é que a leitura acima vale: com 40% por
   * classificar, "o maior setor tem 22%" pode estar errado por muito.
   */
  porClassificarPct: number;
}

function pct1(parte: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((parte / total) * 1000) / 10;
}

/**
 * Reparte a carteira por setor.
 *
 * As posições fechadas — sem valor e sem custo — ficam de fora: uma posição que
 * já não se tem não é exposição a nada. O dinheiro que passou por ela conta na
 * mesma no `reforcoCents` de quem o quiser somar, mas não abre um setor só para
 * si num gráfico de exposição.
 */
export function carteiraPorSetor(posicoes: readonly PosicaoDoSetor[]): CarteiraPorSetor {
  return repartir(posicoes, (p) => setorPorExtenso(p.setor));
}

/**
 * Reparte a carteira por uma etiqueta qualquer.
 *
 * O setor e o tipo de instrumento são a mesma pergunta feita com outra chave —
 * "quanto do meu dinheiro está nisto?" — e a conta é a mesma: somar valor,
 * custo e reforço de um punhado de posições e dividir pelos totais. Escrevê-la
 * duas vezes era duplicar o sítio onde ela pode passar a estar errada.
 *
 * O grupo do que falta chama-se sempre `SEM_SETOR` nas duas leituras, e é isso
 * que faz o resto do ficheiro (o "maior a sério", a percentagem por
 * classificar) valer para as duas sem saber de qual se trata.
 */
function repartir(
  posicoes: readonly PosicaoDoSetor[],
  etiquetaDe: (p: PosicaoDoSetor) => string,
): CarteiraPorSetor {
  const abertas = posicoes.filter((p) => p.valorCents > 0 || p.custoCents > 0);

  const porSetor = new Map<string, PosicaoDoSetor[]>();
  for (const p of abertas) {
    const nome = etiquetaDe(p);
    porSetor.set(nome, [...(porSetor.get(nome) ?? []), p]);
  }

  const valorTotalCents = abertas.reduce((s, p) => s + p.valorCents, 0);
  const reforcoTotalCents = abertas.reduce((s, p) => s + p.reforcoCents, 0);

  const grupos: GrupoDeSetor[] = [...porSetor.entries()].map(([nome, lista]) => {
    const valorCents = lista.reduce((s, p) => s + p.valorCents, 0);
    const custoCents = lista.reduce((s, p) => s + p.custoCents, 0);
    const reforcoCents = lista.reduce((s, p) => s + p.reforcoCents, 0);
    const ganhoCents = custoCents > 0 ? valorCents - custoCents : null;
    return {
      nome,
      porClassificar: nome === SEM_SETOR,
      valorCents,
      custoCents,
      reforcoCents,
      pesoPct: pct1(valorCents, valorTotalCents),
      pesoDoReforcoPct: reforcoTotalCents > 0 ? pct1(reforcoCents, reforcoTotalCents) : null,
      ganhoCents,
      ganhoPct:
        ganhoCents === null ? null : Math.round((ganhoCents / custoCents) * 1000) / 10,
      posicoes: [...lista].sort((a, b) => b.valorCents - a.valorCents),
    };
  });

  /**
   * Do maior para o menor, e "Por classificar" sempre no fim.
   *
   * Não é arrumação: um grupo que só existe porque falta um dado não devia
   * encabeçar uma leitura sobre exposição, mesmo quando é o maior de todos.
   */
  grupos.sort((a, b) => {
    if (a.porClassificar !== b.porClassificar) return a.porClassificar ? 1 : -1;
    return b.valorCents - a.valorCents;
  });

  const semSetor = grupos.find((g) => g.porClassificar) ?? null;

  return {
    grupos,
    valorTotalCents,
    reforcoTotalCents,
    // O maior setor A SÉRIO: "Por classificar" não é uma exposição, é uma
    // lacuna, e anunciá-la como o maior setor da carteira seria uma leitura
    // errada com ar de conclusão.
    maior: grupos.find((g) => !g.porClassificar) ?? null,
    porClassificar: semSetor?.posicoes.length ?? 0,
    porClassificarPct: semSetor ? semSetor.pesoPct : 0,
  };
}

/**
 * Uma empresa e o que lhe aconteceu: quanto entrou, quanto vale.
 *
 * É a leitura "por reforços" — onde é que o dinheiro foi mesmo posto, ao lado do
 * que essa decisão vale hoje. Ordena-se pelo dinheiro que entrou e não pelo
 * valor: a pergunta é sobre as decisões que se tomaram, e a maior posição de
 * hoje pode ser a que menos dinheiro levou.
 */
export interface EmpresaPorReforco extends PosicaoDoSetor {
  setorPorExtenso: string;
  /** `valor − custo`, ou `null` sem custo positivo. */
  ganhoCents: number | null;
  ganhoPct: number | null;
  /** Peso do reforço no total, em percentagem. `null` sem reforços. */
  pesoDoReforcoPct: number | null;
}

export function empresasPorReforco(
  posicoes: readonly PosicaoDoSetor[],
): EmpresaPorReforco[] {
  const total = posicoes.reduce((s, p) => s + p.reforcoCents, 0);
  return posicoes
    .filter((p) => p.reforcoCents > 0)
    .map((p) => {
      const ganhoCents = p.custoCents > 0 ? p.valorCents - p.custoCents : null;
      return {
        ...p,
        setorPorExtenso: setorPorExtenso(p.setor),
        ganhoCents,
        ganhoPct:
          ganhoCents === null ? null : Math.round((ganhoCents / p.custoCents) * 1000) / 10,
        pesoDoReforcoPct: total > 0 ? pct1(p.reforcoCents, total) : null,
      };
    })
    .sort((a, b) => b.reforcoCents - a.reforcoCents);
}

/* -------------------------------------------------------------------------- */

/**
 * Ações ou fundos: a outra pergunta que a lista de investimentos não responde.
 *
 * **Porque é que isto é uma leitura à parte e não mais um setor.** Comprar dez
 * empresas escolhidas e comprar um ETF do mundo inteiro são duas maneiras
 * diferentes de investir, e a diferença não está em nenhum setor: um ETF do
 * mundo tem-nos todos. A pergunta que isto responde é "quanto do meu dinheiro
 * está em escolhas minhas, e essas escolhas estão a valer a pena?" — e sem
 * separar as duas coisas, a resposta estava diluída na média da carteira.
 *
 * **O tipo vem da fonte.** É o `quoteType` do Yahoo, que já vinha no mesmo
 * pedido do preço e era deitado fora. Não se adivinha pelo nome nem pela falta
 * de setor: pelo nome falha nos fundos que não dizem que o são, pela falta de
 * setor falha nos ETF setoriais, que têm setor.
 */
export const TIPOS_PT: Readonly<Record<string, string>> = {
  EQUITY: "Ações",
  ETF: "ETF",
  MUTUALFUND: "Fundos",
  INDEX: "Índices",
  CRYPTOCURRENCY: "Cripto",
  CURRENCY: "Moeda",
  FUTURE: "Futuros",
};

/** O tipo como se lê em português, ou como veio se não se reconhecer. */
export function tipoPorExtenso(bruto: string | null | undefined): string {
  const s = (bruto ?? "").trim();
  if (!s) return SEM_SETOR;
  return TIPOS_PT[s.toUpperCase()] ?? s;
}

/** As escolhas de empresa, de um lado. */
export const ESCOLHAS = "Ações";
/** O mercado comprado inteiro, do outro. Um ETF e um fundo são a mesma decisão. */
export const FUNDOS = "ETF e fundos";

const TIPOS_DE_FUNDO = new Set(["ETF", "MUTUALFUND"]);

/**
 * Reparte a carteira entre escolhas de empresa e mercado comprado inteiro.
 *
 * **Duas fatias e não uma por tipo da fonte.** A pergunta é "quanto disto sou
 * eu a escolher?", e para essa pergunta um ETF e um fundo são a mesma decisão:
 * comprar o cabaz e não escolher lá dentro. Separá-los dava três barras onde a
 * leitura precisa de duas, e a comparação que interessa — escolhas contra
 * cabaz — deixava de estar escrita em lado nenhum.
 *
 * O que não for nem uma coisa nem outra (cripto, moeda) fica com o nome que a
 * fonte lhe dá, em vez de ser arrumado à força num dos dois lados.
 *
 * A conta é a mesma da repartição por setor. Ver `repartir`.
 */
export function carteiraPorTipo(posicoes: readonly PosicaoDoSetor[]): CarteiraPorSetor {
  return repartir(posicoes, (p) => {
    const t = (p.instrumento ?? "").trim().toUpperCase();
    if (!t) return SEM_SETOR;
    if (t === "EQUITY") return ESCOLHAS;
    if (TIPOS_DE_FUNDO.has(t)) return FUNDOS;
    return tipoPorExtenso(t);
  });
}

/**
 * As escolhas estão a valer a pena, comparadas com o cabaz?
 *
 * **O que este número é, e o que não é.** É o ganho sobre o custo do que ainda
 * se tem, de um lado e do outro, e a diferença entre os dois em pontos. Não
 * conta com o tempo: uma posição aberta o mês passado teve menos tempo para
 * subir do que uma de há três anos, e isso não aparece aqui. Para a pergunta
 * "escolher valeu a pena?" chega, desde que se diga o que se está a comparar —
 * e é por isso que o ecrã diz.
 *
 * `null` quando falta um dos lados: uma carteira só de ETF não tem nada com que
 * se comparar, e inventar-lhe um zero seria pior do que não dizer nada.
 */
export function escolhasContraFundos(
  carteira: CarteiraPorSetor,
): { escolhasPct: number; fundosPct: number; diferencaPontos: number } | null {
  const a = carteira.grupos.find((g) => g.nome === ESCOLHAS);
  const f = carteira.grupos.find((g) => g.nome === FUNDOS);
  if (!a || !f || a.ganhoPct === null || f.ganhoPct === null) return null;
  return {
    escolhasPct: a.ganhoPct,
    fundosPct: f.ganhoPct,
    diferencaPontos: Math.round((a.ganhoPct - f.ganhoPct) * 10) / 10,
  };
}
