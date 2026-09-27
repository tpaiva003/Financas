/**
 * Comparar uma empresa com o setor dela — o setor que **tu** tens.
 *
 * **A coluna que faltava, e a razão de ela ser assim.** A folha de cálculo que
 * esta app substitui compara cada empresa com médias do setor. Médias setoriais
 * a sério — as que um terminal profissional vende — não existem em fonte
 * gratuita nenhuma, e inventá-las era o modo de falha nº 5 desta app: um número
 * com o tamanho certo, ar de facto, e sem forma de ser conferido.
 *
 * O que existe e se pode conferir é **a tua própria carteira**. Comparar a
 * empresa que estás a estudar com as que já tens no mesmo setor responde a uma
 * pergunta diferente da original, e mais honesta: *isto é melhor ou pior do que
 * aquilo que já comprei?* — que é, no fim, a decisão que estás mesmo a tomar.
 *
 * **A base tem de estar à vista, sempre.** Uma "média do setor" tirada de duas
 * empresas não é uma média de nada; com uma, é a própria. Por isso o número de
 * empresas vai colado ao resultado e nunca se separa dele.
 *
 * Lógica pura, sem acesso a dados.
 */

/** Uma empresa da carteira, com o que se compara. */
export interface ParDoSetor {
  id: string;
  nome: string;
  /** Só entram as que têm este indicador. Ver `medianaDe`. */
  valor: number;
}

export interface ComparacaoNoSetor {
  setor: string;
  /** Quantas empresas tuas entraram na conta. É o que dá crédito ao resto. */
  quantas: number;
  /** A mediana das tuas, e não a média: uma posição estranha não a arrasta. */
  medianaDaCarteira: number;
  /** O valor da empresa em estudo. */
  valorDaEmpresa: number;
  /** Diferença em pontos, do estudo para a mediana. */
  diferenca: number;
  /** As tuas empresas do setor, da maior para a menor neste indicador. */
  pares: ParDoSetor[];
}

/**
 * A mediana, que é o que se usa aqui e não a média.
 *
 * Com meia dúzia de empresas, uma delas com um ROCE de 90% puxa a média para um
 * sítio onde não está nenhuma. A mediana descreve o meio do grupo, que é o que
 * a pergunta "como é que isto se compara com o que já tenho" quer saber.
 */
export function mediana(valores: readonly number[]): number | null {
  const vs = [...valores].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (vs.length === 0) return null;
  const meio = Math.floor(vs.length / 2);
  const m = vs.length % 2 === 1 ? vs[meio]! : (vs[meio - 1]! + vs[meio]!) / 2;
  return Math.round(m * 10) / 10;
}

/**
 * Compara um indicador da empresa em estudo com as tuas do mesmo setor.
 *
 * `null` quando não há com que comparar: sem setor na empresa em estudo, sem
 * empresas tuas nesse setor, ou sem o indicador de parte a parte. **Nunca
 * devolve uma comparação com zero empresas** — um "está acima do setor" apoiado
 * em nada é a pior das respostas possíveis, porque é a mais convincente.
 *
 * A empresa em estudo é excluída dos pares quando já está na carteira: comparar
 * uma coisa consigo própria dá sempre zero de diferença e não informa nada.
 */
export function compararNoSetor(input: {
  setor: string | null;
  valorDaEmpresa: number | null;
  /** As tuas empresas: id, nome, setor e o valor deste indicador. */
  carteira: readonly { id: string; nome: string; setor: string | null; valor: number | null }[];
  /** O id da empresa em estudo, quando ela já está na carteira. */
  excluirId?: string | null;
}): ComparacaoNoSetor | null {
  const setor = (input.setor ?? "").trim();
  if (!setor) return null;
  if (input.valorDaEmpresa === null || !Number.isFinite(input.valorDaEmpresa)) return null;

  const pares: ParDoSetor[] = input.carteira
    .filter(
      (c) =>
        (c.setor ?? "").trim() === setor &&
        c.id !== input.excluirId &&
        c.valor !== null &&
        Number.isFinite(c.valor),
    )
    .map((c) => ({ id: c.id, nome: c.nome, valor: c.valor as number }))
    .sort((a, b) => b.valor - a.valor);

  if (pares.length === 0) return null;

  const medianaDaCarteira = mediana(pares.map((p) => p.valor))!;
  return {
    setor,
    quantas: pares.length,
    medianaDaCarteira,
    valorDaEmpresa: input.valorDaEmpresa,
    diferenca: Math.round((input.valorDaEmpresa - medianaDaCarteira) * 10) / 10,
    pares,
  };
}

/**
 * O que uma comparação vale, por palavras.
 *
 * Com uma empresa só não há mediana nenhuma — há a outra empresa, e dizê-lo
 * assim evita que "acima da mediana do setor" passe por uma leitura estatística
 * quando é uma comparação entre dois nomes.
 */
export function confiancaPorExtenso(quantas: number): string {
  if (quantas === 1) return "Comparado com a única que tens neste setor, não é uma mediana, é a outra empresa.";
  if (quantas < 4) return `Comparado com as ${quantas} que tens neste setor. São poucas: lê como indicação, não como referência.`;
  return `Mediana das ${quantas} que tens neste setor.`;
}
