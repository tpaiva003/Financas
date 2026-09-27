/**
 * A carteira contra o índice **num período**, e não só desde o início.
 *
 * A comparação desde o início responde a "valeu a pena?". Não responde a "como
 * é que isto está a correr agora" — e são perguntas diferentes com respostas
 * que se contradizem sem se contradizerem: uma carteira que bateu o índice em
 * cinco anos pode estar a perder para ele há três meses, e as duas coisas são
 * verdade ao mesmo tempo.
 *
 * ## Porquê TWR e não a conta do costume
 *
 * Num período curto a tentação é fazer `(valor_hoje - valor_no_início) /
 * valor_no_início`. Essa conta trata **um reforço como se fosse lucro**. Quem
 * meteu 10 000 € no meio do mês vê a carteira subir 10 000 € e a conta
 * anuncia-lhe uma subida de dezenas por cento que ninguém ganhou. Nas janelas
 * curtas o erro é maior, não menor: quanto mais curto o período, mais um
 * reforço pesa contra o que o mercado teve tempo de fazer.
 *
 * A rentabilidade ponderada no tempo parte o período nos troços entre
 * movimentos e multiplica o crescimento de cada um. É o que o
 * `timeWeightedReturn` já fazia, e é o que se compara com a subida do índice —
 * porque um índice também não recebe reforços.
 *
 * ## Porque é que isto recusa tanto
 *
 * Uma janela só se desenha quando se sabe o valor da carteira **em todos os
 * pontos que a delimitam**: as duas pontas e cada dia de movimento pelo meio.
 * Se faltar um, o troço que ele fecha mede outra coisa — e o resultado sai com
 * ar de resposta. Uma janela de "1 ano" numa carteira com seis meses tem o
 * mesmo problema, agravado pelo rótulo: diz um ano e mede metade.
 *
 * Lógica pura, sem acesso a dados.
 */

import { timeWeightedReturn, type ValuePoint } from "./returns";
import { diaDoPreco, type FluxoDatado, type PrecosPorDia } from "./serie-comparacao";

export interface Janela {
  id: string;
  /** Como se lê no ecrã. */
  label: string;
  /** Dias a recuar, para as janelas curtas. */
  dias: number | null;
  /** Meses a recuar, para as longas. */
  meses: number | null;
}

/**
 * As janelas, da mais curta para a mais longa.
 *
 * Contam-se em **dias de calendário e não de bolsa**: "há uma semana" é há sete
 * dias, e é isso que quem pergunta quer dizer. O preço de um dia sem sessão
 * resolve-se recuando até ao último fecho que existiu mesmo (`precoNoDia`), que
 * é o que qualquer corretora faz — e nunca inventando um preço para o feriado.
 */
export const JANELAS: readonly Janela[] = [
  { id: "1d", label: "1 dia", dias: 1, meses: null },
  { id: "7d", label: "7 dias", dias: 7, meses: null },
  { id: "15d", label: "15 dias", dias: 15, meses: null },
  { id: "1m", label: "1 mês", dias: null, meses: 1 },
  { id: "3m", label: "3 meses", dias: null, meses: 3 },
  { id: "6m", label: "6 meses", dias: null, meses: 6 },
  { id: "1a", label: "1 ano", dias: null, meses: 12 },
];

export function janelaPorId(id: string): Janela | null {
  return JANELAS.find((j) => j.id === id) ?? null;
}

/**
 * O primeiro dia da janela que acaba em `ate`.
 *
 * **Os meses encolhem-se para o último dia que existe.** Um mês antes de 31 de
 * março é 28 de fevereiro, não 3 de março. O `setUTCMonth` do JavaScript faz
 * exactamente o contrário — transborda para o mês seguinte — e uma janela de
 * "1 mês" que começa depois do dia certo mede menos tempo do que anuncia.
 */
export function inicioDaJanela(ate: string, janela: Janela): string {
  const base = new Date(`${ate.slice(0, 10)}T00:00:00Z`);

  if (janela.dias !== null) {
    base.setUTCDate(base.getUTCDate() - janela.dias);
    return base.toISOString().slice(0, 10);
  }

  const meses = janela.meses ?? 0;
  const ano = base.getUTCFullYear();
  const mes = base.getUTCMonth();
  const dia = base.getUTCDate();

  const alvo = new Date(Date.UTC(ano, mes - meses, 1));
  // O dia zero do mês seguinte é o último do mês alvo.
  const ultimoDoAlvo = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0),
  ).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimoDoAlvo));
  return alvo.toISOString().slice(0, 10);
}

export interface DesempenhoDaJanela {
  id: string;
  label: string;
  /** Primeiro dia do período. */
  de: string;
  /** Último dia do período. */
  ate: string;
  /** Rentabilidade da carteira no período, ponderada no tempo. */
  carteiraPct: number | null;
  /** Quanto o índice subiu ou desceu no mesmo período. */
  indicePct: number | null;
  /** Carteira menos índice, em pontos percentuais. Positivo é estar à frente. */
  diferencaPct: number | null;
  /** O que a carteira valia no início do período. */
  carteiraInicioCents: number | null;
  /** O que vale no fim. */
  carteiraFimCents: number | null;
  /** Dinheiro que entrou durante o período. Não é lucro, e o TWR não o conta. */
  fluxoNoPeriodoCents: number;
  /**
   * Porque é que não há números, quando não há.
   *
   * É um **fragmento em minúscula**, não uma frase solta: mostra-se sempre
   * depois dos períodos a que se aplica ("1 dia e 7 dias: o fecho de..."), e
   * uma maiúscula a meio da linha lia-se como se fosse outra frase.
   */
  motivo: string | null;
}

/**
 * A carteira contra o índice numa janela.
 *
 * `carteiraEm` devolve o que a carteira valia numa data, ou `null` quando não
 * se consegue saber. Um `null` em qualquer ponto que delimite um troço recusa a
 * janela inteira: ver o cabeçalho.
 */
export function desempenhoNaJanela(input: {
  janela: Janela;
  /** Último dia do período, normalmente hoje. */
  ate: string;
  /** O primeiro dia em que houve carteira. Antes disto não há nada a medir. */
  primeiroDia: string;
  carteiraEm: (data: string) => number | null;
  precosDoIndice: PrecosPorDia;
  /** Todos os movimentos de dinheiro da carteira, com data. */
  fluxos: readonly FluxoDatado[];
}): DesempenhoDaJanela {
  const { janela, ate, primeiroDia, carteiraEm, precosDoIndice, fluxos } = input;
  const de = inicioDaJanela(ate, janela);

  const vazio = (motivo: string): DesempenhoDaJanela => ({
    id: janela.id,
    label: janela.label,
    de,
    ate,
    carteiraPct: null,
    indicePct: null,
    diferencaPct: null,
    carteiraInicioCents: null,
    carteiraFimCents: null,
    fluxoNoPeriodoCents: 0,
    motivo,
  });

  if (de >= ate) return vazio("a janela não tem tempo nenhum lá dentro.");

  /**
   * Uma janela mais velha do que a carteira mede menos tempo do que o rótulo
   * dela promete, e não há como quem lê desconfiar: "1 ano: +4%" numa carteira
   * de três meses é uma frase que se acredita.
   */
  if (de < primeiroDia) {
    return vazio(`a carteira só existe desde ${primeiroDia}.`);
  }

  const carteiraInicioCents = carteiraEm(de);
  if (carteiraInicioCents === null) {
    return vazio(`sem cotações para saber o que a carteira valia em ${de}.`);
  }
  const carteiraFimCents = carteiraEm(ate);
  if (carteiraFimCents === null) {
    return vazio(`sem cotações para saber o que a carteira vale em ${ate}.`);
  }

  const diaInicio = diaDoPreco(precosDoIndice, de);
  const diaFim = diaDoPreco(precosDoIndice, ate);
  if (diaInicio === null || diaFim === null) {
    return vazio("o índice não tem cotações para todo o período.");
  }
  /**
   * **As duas pontas no mesmo fecho não medem nada.**
   *
   * Numa segunda-feira, com o último fecho na sexta, tanto o início como o fim
   * de uma janela de um dia recuam para sexta — e a conta dava +0,0% dos dois
   * lados. Lê-se como "esteve parado", quando o que se passa é que ainda não há
   * dia nenhum para comparar. O mesmo acontece num feriado, ou sempre que as
   * cotações estão uns dias atrasadas.
   */
  if (diaInicio === diaFim) {
    return vazio(
      `o fecho de ${diaFim} serve as duas pontas, e ainda não há período nenhum para medir.`,
    );
  }
  const precoInicio = precosDoIndice[diaInicio]!;
  const precoFim = precosDoIndice[diaFim]!;

  /**
   * Os movimentos dentro da janela, um ponto por dia.
   *
   * Agrupam-se por data porque dois reforços no mesmo dia são um só troço: o
   * `timeWeightedReturn` ignora pares no mesmo dia de propósito, e mandar-lhe
   * dois pontos com a mesma data deitava o segundo movimento fora.
   */
  const porDia = new Map<string, number>();
  for (const f of fluxos) {
    const dia = f.date.slice(0, 10);
    if (dia <= de || dia > ate) continue;
    porDia.set(dia, (porDia.get(dia) ?? 0) + f.amountCents);
  }

  const pontos: ValuePoint[] = [{ date: de, valueCents: carteiraInicioCents, flowCents: 0 }];
  for (const dia of [...porDia.keys()].sort()) {
    const fluxoDoDia = porDia.get(dia)!;
    const valor = dia === ate ? carteiraFimCents : carteiraEm(dia);
    if (valor === null) {
      return vazio(`sem cotações para avaliar a carteira em ${dia}, dia de movimento.`);
    }
    /**
     * **Dois pontos no dia do movimento, e a ordem importa.**
     *
     * O primeiro tira o dinheiro que entrou hoje e fecha com ele o troço que
     * vinha de trás: sem isto, o reforço entrava na base do troço anterior
     * como se lá estivesse desde o primeiro dia, e a subida que o mercado deu
     * a esse dinheiro em duas semanas era espalhada por um mês inteiro.
     *
     * O segundo não fecha troço nenhum — o `timeWeightedReturn` ignora pares
     * na mesma data de propósito — e serve só de base ao troço seguinte, já
     * com o dinheiro novo lá dentro.
     */
    pontos.push({ date: dia, valueCents: valor - fluxoDoDia, flowCents: 0 });
    pontos.push({ date: dia, valueCents: valor, flowCents: fluxoDoDia });
  }
  // Um movimento no último dia já deixou o valor final como ponto: repeti-lo
  // não fecharia troço nenhum (mesma data) e só juntava ruído.
  if (!porDia.has(ate)) {
    pontos.push({ date: ate, valueCents: carteiraFimCents, flowCents: 0 });
  }

  const carteiraPct = timeWeightedReturn(pontos);
  const indicePct = (precoFim / precoInicio - 1) * 100;

  let fluxoNoPeriodoCents = 0;
  for (const v of porDia.values()) fluxoNoPeriodoCents += v;

  return {
    id: janela.id,
    label: janela.label,
    de,
    ate,
    carteiraPct,
    indicePct,
    diferencaPct: carteiraPct === null ? null : carteiraPct - indicePct,
    carteiraInicioCents,
    carteiraFimCents,
    fluxoNoPeriodoCents,
    motivo: null,
  };
}
