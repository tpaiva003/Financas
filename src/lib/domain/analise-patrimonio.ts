/**
 * Analisar o património mês a mês: o que cresceu, e porquê.
 *
 * **A pergunta que faltava.** O gráfico mostra a linha a subir e não diz de
 * onde veio a subida. São duas coisas muito diferentes: pôr dinheiro de lado e
 * o dinheiro que lá está valorizar. A primeira depende de quem poupa, a segunda
 * do mercado — e num mês bom de bolsa a linha sobe sem ninguém ter feito nada,
 * o que se lê como mérito próprio.
 *
 * A conta é simples e faz-se com o que a app já tem: a variação do património
 * num mês, menos o dinheiro que entrou em investimentos nesse mês, é o que
 * sobra — a valorização. O resto do património (contas, imóveis) mexe-se por
 * outras razões e entra na mesma conta, o que torna este número **um saldo e
 * não uma rentabilidade**. É por isso que se chama "não veio de reforços" e não
 * "ganho".
 *
 * **Um mês reconstruído não entra em nada disto.** Os pontos reconstruídos
 * trazem o saldo de hoje das contas projetado para trás; a variação entre dois
 * deles é uma diferença entre estimativas, não um facto. Entram na série para
 * o gráfico e ficam de fora das contas.
 *
 * Lógica pura, sem acesso a dados.
 */

import type { Trade } from "./positions";

/** Uma fotografia mensal, como a série do património a produz. */
export interface PontoMensal {
  /** "AAAA-MM". */
  mes: string;
  netCents: number;
  estimado?: boolean;
}

export interface MesAnalisado {
  mes: string;
  netCents: number;
  /** Face ao mês anterior. `null` no primeiro, ou se algum dos dois é estimado. */
  variacaoCents: number | null;
  /** Dinheiro que entrou em investimentos: compras e custos menos vendas. */
  reforcoCents: number;
  /** Quantas compras foram registadas nesse mês. */
  compras: number;
  /**
   * A parte da variação que não veio de reforços.
   *
   * `null` quando a variação não é de confiança. Ver o cabeçalho para a razão
   * de isto não ser uma rentabilidade.
   */
  semReforcosCents: number | null;
}

export interface AnalisePatrimonio {
  meses: MesAnalisado[];
  /** O mês que mais cresceu, e o que mais caiu. `null` sem meses medidos. */
  melhorMes: MesAnalisado | null;
  piorMes: MesAnalisado | null;
  /** O mês em que se comprou mais vezes. */
  mesComMaisCompras: MesAnalisado | null;
  /** O mês em que entrou mais dinheiro. */
  mesComMaiorReforco: MesAnalisado | null;
  /** Média das variações mensais medidas. `null` se não houver nenhuma. */
  mediaMensalCents: number | null;
  /** Quanto entrou ao todo, e quanto do crescimento não veio daí. */
  totalReforcosCents: number;
  totalSemReforcosCents: number | null;
  /** Quantos meses entraram nas contas. É o que dá crédito aos números. */
  mesesMedidos: number;
}

function mesDe(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * O dinheiro que entrou em investimentos em cada mês.
 *
 * Compras e custos somam; vendas subtraem. Os dividendos ficam de fora: são
 * dinheiro que **saiu** do investimento para a conta, e contá-los como reforço
 * negativo faria um mês de dividendos parecer um mês de resgates.
 */
export function reforcosPorMes(trades: readonly Trade[]): Map<string, { cents: number; compras: number }> {
  const out = new Map<string, { cents: number; compras: number }>();
  for (const t of trades) {
    const m = mesDe(t.date);
    const atual = out.get(m) ?? { cents: 0, compras: 0 };
    const valor = Math.abs(t.amountCents || 0);
    if (t.kind === "compra") {
      atual.cents += valor;
      atual.compras += 1;
    } else if (t.kind === "custo") {
      atual.cents += valor;
    } else if (t.kind === "venda") {
      atual.cents -= valor;
    }
    out.set(m, atual);
  }
  return out;
}

export function analisarPatrimonio(
  pontos: readonly PontoMensal[],
  trades: readonly Trade[],
): AnalisePatrimonio {
  const reforcos = reforcosPorMes(trades);

  const meses: MesAnalisado[] = pontos.map((p, i) => {
    const anterior = i > 0 ? pontos[i - 1]! : null;
    // Uma variação entre estimativas não é um facto. Ver o cabeçalho.
    const confiavel = anterior !== null && !p.estimado && !anterior.estimado;
    const variacaoCents = confiavel ? p.netCents - anterior!.netCents : null;
    const r = reforcos.get(p.mes) ?? { cents: 0, compras: 0 };
    return {
      mes: p.mes,
      netCents: p.netCents,
      variacaoCents,
      reforcoCents: r.cents,
      compras: r.compras,
      semReforcosCents: variacaoCents === null ? null : variacaoCents - r.cents,
    };
  });

  const medidos = meses.filter((m) => m.variacaoCents !== null);
  const comReforco = meses.filter((m) => m.reforcoCents !== 0 || m.compras > 0);

  const melhorMes = medidos.reduce<MesAnalisado | null>(
    (a, m) => (a === null || m.variacaoCents! > a.variacaoCents! ? m : a),
    null,
  );
  const piorMes = medidos.reduce<MesAnalisado | null>(
    (a, m) => (a === null || m.variacaoCents! < a.variacaoCents! ? m : a),
    null,
  );
  const mesComMaisCompras = comReforco.reduce<MesAnalisado | null>(
    (a, m) => (a === null || m.compras > a.compras ? m : a),
    null,
  );
  const mesComMaiorReforco = comReforco.reduce<MesAnalisado | null>(
    (a, m) => (a === null || m.reforcoCents > a.reforcoCents ? m : a),
    null,
  );

  const mediaMensalCents =
    medidos.length > 0
      ? Math.round(medidos.reduce((s, m) => s + m.variacaoCents!, 0) / medidos.length)
      : null;

  return {
    meses,
    melhorMes,
    piorMes,
    // Um mês sem compras nenhumas não é "o mês com mais compras".
    mesComMaisCompras: mesComMaisCompras && mesComMaisCompras.compras > 0 ? mesComMaisCompras : null,
    mesComMaiorReforco:
      mesComMaiorReforco && mesComMaiorReforco.reforcoCents > 0 ? mesComMaiorReforco : null,
    mediaMensalCents,
    totalReforcosCents: meses.reduce((s, m) => s + m.reforcoCents, 0),
    totalSemReforcosCents:
      medidos.length > 0 ? medidos.reduce((s, m) => s + (m.semReforcosCents ?? 0), 0) : null,
    mesesMedidos: medidos.length,
  };
}
