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
  /** Quanto vale hoje. */
  valorCents: number;
  /** Quanto custou o que ainda se tem. */
  custoCents: number;
  /** Dinheiro que entrou nesta posição ao longo do tempo — compras e custos. */
  reforcoCents: number;
}

export interface GrupoDeSetor {
  setor: string;
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
  const abertas = posicoes.filter((p) => p.valorCents > 0 || p.custoCents > 0);

  const porSetor = new Map<string, PosicaoDoSetor[]>();
  for (const p of abertas) {
    const nome = setorPorExtenso(p.setor);
    porSetor.set(nome, [...(porSetor.get(nome) ?? []), p]);
  }

  const valorTotalCents = abertas.reduce((s, p) => s + p.valorCents, 0);
  const reforcoTotalCents = abertas.reduce((s, p) => s + p.reforcoCents, 0);

  const grupos: GrupoDeSetor[] = [...porSetor.entries()].map(([setor, lista]) => {
    const valorCents = lista.reduce((s, p) => s + p.valorCents, 0);
    const custoCents = lista.reduce((s, p) => s + p.custoCents, 0);
    const reforcoCents = lista.reduce((s, p) => s + p.reforcoCents, 0);
    const ganhoCents = custoCents > 0 ? valorCents - custoCents : null;
    return {
      setor,
      porClassificar: setor === SEM_SETOR,
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
