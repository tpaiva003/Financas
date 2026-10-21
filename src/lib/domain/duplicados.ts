/**
 * Dois registos para o mesmo investimento.
 *
 * **De onde vêm.** Da importação. A mesma corretora escreve "ADR ON UNILEVER"
 * num extrato e "ADR ON UNILEVER PLC" no seguinte, e a app cria dois
 * investimentos porque os nomes não batem certo. Nenhum dos dois está errado —
 * o que está errado é serem dois. O dinheiro conta a dobrar no investido, a
 * posição aparece partida ao meio, e a rentabilidade de cada metade é calculada
 * contra o custo da outra.
 *
 * **Só se juntam pelo símbolo, e nunca pelo nome.** É a decisão que manda neste
 * ficheiro. "XPHYTO THERAPEUTICS" e "XPHYTO THERAPEUTICS - NON TRADEABLE" têm
 * nomes quase iguais e **não são a mesma coisa**: uma negoceia e a outra não, e
 * juntá-las apagava a distinção que alguém teve o trabalho de fazer. Já o
 * símbolo é um facto: dois registos com `ul.us` são a mesma empresa, ponto.
 * Parecença de nomes é um palpite sobre dinheiro de alguém, e esta app não os
 * dá.
 *
 * **Sugere qual fica, não decide.** A escolha muda para onde vão os movimentos
 * todos e qual o registo que desaparece — é do dono, não da app.
 *
 * Lógica pura, sem acesso a dados.
 */

/** O mínimo que se precisa de saber de um bem para o comparar. */
export interface AtivoComparavel {
  id: string;
  name: string;
  symbol?: string | null;
  logoDomain?: string | null;
  exchange?: string | null;
  createdAt?: string | null;
}

export interface AtivoDuplicado<T extends AtivoComparavel = AtivoComparavel> {
  ativo: T;
  /** Quantos movimentos tem hoje. */
  movimentos: number;
}

export interface GrupoDuplicado<T extends AtivoComparavel = AtivoComparavel> {
  /** O símbolo que os une, em minúsculas. */
  simbolo: string;
  /** O que a app sugere manter. Sugestão, não decisão. */
  sugeridoId: string;
  membros: AtivoDuplicado<T>[];
}

/**
 * Quantos campos preenchidos tem — o desempate quando os movimentos empatam.
 *
 * Manter o registo mais completo poupa trabalho a quem funde: o logo, a bolsa e
 * o símbolo do outro perdem-se na fusão, e não vale a pena escolher a versão
 * pobre por acaso.
 */
function riqueza(a: AtivoComparavel): number {
  return [a.logoDomain, a.exchange, a.symbol].filter(Boolean).length;
}

/**
 * Os grupos de investimentos que são o mesmo, pelo símbolo.
 *
 * `movimentosPorAtivo` diz quantos movimentos tem cada um. Não é enfeite: é o
 * critério principal da sugestão, porque o registo com o historial todo é o que
 * menos custa manter.
 */
export function duplicadosDeAtivos<T extends AtivoComparavel>(
  ativos: readonly T[],
  movimentosPorAtivo: ReadonlyMap<string, number>,
): GrupoDuplicado<T>[] {
  const porSimbolo = new Map<string, T[]>();
  for (const a of ativos) {
    const s = a.symbol?.trim().toLowerCase();
    if (!s) continue;
    const lista = porSimbolo.get(s);
    if (lista) lista.push(a);
    else porSimbolo.set(s, [a]);
  }

  const grupos: GrupoDuplicado<T>[] = [];
  for (const [simbolo, lista] of porSimbolo) {
    if (lista.length < 2) continue;

    const membros = lista
      .map((ativo) => ({ ativo, movimentos: movimentosPorAtivo.get(ativo.id) ?? 0 }))
      .sort((x, y) => {
        if (y.movimentos !== x.movimentos) return y.movimentos - x.movimentos;
        const r = riqueza(y.ativo) - riqueza(x.ativo);
        if (r !== 0) return r;
        // O mais antigo ganha: é o que já estava, e é a ele que estão presos os
        // anexos e o que mais gente já viu.
        const cx = x.ativo.createdAt ?? "";
        const cy = y.ativo.createdAt ?? "";
        if (cx !== cy) return cx < cy ? -1 : 1;
        // Último critério, só para a ordem não depender da sorte da consulta.
        return x.ativo.id < y.ativo.id ? -1 : 1;
      });

    grupos.push({ simbolo, sugeridoId: membros[0]!.ativo.id, membros });
  }

  // Primeiro os que têm mais registos a juntar, que são os que mais distorcem.
  return grupos.sort((a, b) =>
    b.membros.length - a.membros.length || (a.simbolo < b.simbolo ? -1 : 1),
  );
}

/** Uma frase para o ecrã, sem obrigar a contar cartões. */
export function duplicadosPorExtenso(grupos: readonly GrupoDuplicado[]): string | null {
  if (grupos.length === 0) return null;
  const registos = grupos.reduce((s, g) => s + g.membros.length, 0);
  const aMais = registos - grupos.length;
  return grupos.length === 1
    ? `Há ${registos} registos do mesmo investimento.`
    : `Há ${grupos.length} investimentos com registos repetidos: ${aMais} a mais.`;
}
