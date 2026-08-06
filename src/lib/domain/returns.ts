/**
 * Rentabilidade de uma carteira que recebe reforços ao longo do tempo.
 *
 * Há duas perguntas diferentes, e confundi-las é o erro mais comum a falar de
 * investimentos:
 *
 * 1. **Quanto rendeu o MEU dinheiro?** Depende de quando o meti. Quem reforçou
 *    muito mesmo antes de uma subida ganhou mais do que quem reforçou depois,
 *    com exatamente os mesmos fundos. Responde-se com a TIR (taxa interna de
 *    rentabilidade, ou XIRR): a taxa anual que faz as entradas e saídas datadas
 *    baterem certo com o valor de hoje.
 *
 * 2. **O investimento foi bom?** Aqui os reforços são ruído. Quem escolheu bem
 *    não fica pior por ter tido menos dinheiro para investir no início. Responde-se
 *    com a rentabilidade ponderada no tempo (TWR), que divide o período em
 *    troços entre movimentos e multiplica os seus crescimentos, anulando o
 *    efeito de quando entrou dinheiro.
 *
 * **É a TWR que se compara com um índice.** Um índice não tem reforços: comparar
 * a TIR da carteira com a variação do S&P 500 é comparar coisas diferentes, e dá
 * sempre a conclusão errada quando houve reforços grandes perto do fim.
 *
 * Para responder a "e se eu tivesse metido este dinheiro no índice?", há a
 * `simulateBenchmark`, que aplica AS MESMAS entradas, NAS MESMAS datas, ao
 * índice. Essa sim é uma comparação justa em euros.
 *
 * Lógica pura, sem acesso a dados.
 */

/** Movimento de dinheiro. Positivo = entrou para a carteira (compra). */
export interface CashFlow {
  /** "YYYY-MM-DD". */
  date: string;
  /** Cêntimos. Positivo = investiu, negativo = levantou. */
  amountCents: number;
}

const DAY_MS = 86_400_000;

function toTime(date: string): number {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime();
}

function yearsBetween(from: string, to: string): number {
  return (toTime(to) - toTime(from)) / (365.25 * DAY_MS);
}

/**
 * TIR anualizada (XIRR): a taxa que torna o valor atual dos fluxos igual a zero.
 *
 * Resolve-se por bissecção em vez de Newton-Raphson: é mais lento e não
 * interessa nada a esta escala, mas não diverge com fluxos irregulares, que é
 * precisamente o caso de quem reforça quando pode.
 *
 * Devolve a taxa em percentagem (7.4 = 7,4% ao ano), ou null quando não há
 * resposta possível.
 */
export function xirr(flows: CashFlow[], finalValueCents: number, valueDate: string): number | null {
  const all: CashFlow[] = [...flows, { date: valueDate, amountCents: -finalValueCents }];
  if (all.length < 2) return null;

  const sorted = [...all].sort((a, b) => toTime(a.date) - toTime(b.date));
  const start = sorted[0]!.date;

  // Sem sinais opostos não há taxa que zere a conta.
  const hasPositive = sorted.some((f) => f.amountCents > 0);
  const hasNegative = sorted.some((f) => f.amountCents < 0);
  if (!hasPositive || !hasNegative) return null;

  const npv = (rate: number): number =>
    sorted.reduce((sum, f) => {
      const t = yearsBetween(start, f.date);
      return sum + f.amountCents / Math.pow(1 + rate, t);
    }, 0);

  // Perder tudo é -100%; acima de 1000% ao ano não é um número útil.
  let low = -0.9999;
  let high = 10;
  let fLow = npv(low);
  let fHigh = npv(high);
  if (Number.isNaN(fLow) || Number.isNaN(fHigh)) return null;
  if (fLow * fHigh > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1 || high - low < 1e-9) return mid * 100;
    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return ((low + high) / 2) * 100;
}

/** Fotografia do valor da carteira num momento, com o movimento desse dia. */
export interface ValuePoint {
  date: string;
  /** Valor da carteira NO FIM do dia, já com o movimento incluído. */
  valueCents: number;
  /** Dinheiro que entrou (ou saiu) nesse dia. */
  flowCents: number;
}

/**
 * Rentabilidade ponderada no tempo (TWR), em percentagem.
 *
 * Divide o período nos troços entre movimentos e multiplica os crescimentos de
 * cada um. Um reforço aumenta o valor da carteira sem ser lucro, e é isso que
 * esta conta desconta.
 */
export function timeWeightedReturn(points: ValuePoint[]): number | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => toTime(a.date) - toTime(b.date));

  let growth = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    // O valor de partida do troço inclui o dinheiro que entrou no início dele.
    const base = prev.valueCents + cur.flowCents;
    if (base <= 0) continue; // troço sem capital investido: não diz nada
    growth *= cur.valueCents / base;
  }
  return (growth - 1) * 100;
}

/** Anualiza uma rentabilidade total ao longo de um período. */
export function annualize(totalReturnPct: number, from: string, to: string): number | null {
  const years = yearsBetween(from, to);
  if (years <= 0) return null;
  const total = 1 + totalReturnPct / 100;
  if (total <= 0) return null;
  return (Math.pow(total, 1 / years) - 1) * 100;
}

export interface BenchmarkComparison {
  /** Valor que a carteira teria se o mesmo dinheiro tivesse ido para o índice. */
  benchmarkValueCents: number;
  /** Total investido (soma das entradas). */
  investedCents: number;
  /** Valor real da carteira. */
  portfolioValueCents: number;
  /** Carteira menos índice. Positivo = bateste o índice. */
  differenceCents: number;
  /** Rentabilidade da carteira sobre o investido, em percentagem. */
  portfolioReturnPct: number | null;
  benchmarkReturnPct: number | null;
}

/**
 * Compara a carteira com um índice, aplicando-lhe OS MESMOS reforços NAS MESMAS
 * datas.
 *
 * É esta a comparação honesta. Dizer "o S&P 500 subiu 20% e eu subi 8%" ignora
 * que a maior parte do dinheiro pode ter entrado no último mês, e nesse caso os
 * 20% do índice nunca estiveram disponíveis para esse dinheiro.
 *
 * @param prices cotações do índice por data, em cêntimos.
 */
export function simulateBenchmark(
  flows: CashFlow[],
  prices: Record<string, number>,
  portfolioValueCents: number,
  valueDate: string,
): BenchmarkComparison | null {
  const finalPrice = priceOn(prices, valueDate);
  if (finalPrice === null || finalPrice <= 0) return null;

  let units = 0;
  let investedCents = 0;

  for (const f of [...flows].sort((a, b) => toTime(a.date) - toTime(b.date))) {
    const price = priceOn(prices, f.date);
    if (price === null || price <= 0) continue;
    units += f.amountCents / price;
    investedCents += f.amountCents;
  }

  const benchmarkValueCents = Math.round(units * finalPrice);
  return {
    benchmarkValueCents,
    investedCents,
    portfolioValueCents,
    differenceCents: portfolioValueCents - benchmarkValueCents,
    portfolioReturnPct:
      investedCents > 0 ? ((portfolioValueCents - investedCents) / investedCents) * 100 : null,
    benchmarkReturnPct:
      investedCents > 0 ? ((benchmarkValueCents - investedCents) / investedCents) * 100 : null,
  };
}

/**
 * Cotação numa data. Se não houver (fim de semana, feriado), usa a última
 * anterior, que é o que qualquer corretora faz.
 */
export function priceOn(prices: Record<string, number>, date: string): number | null {
  const target = date.slice(0, 10);
  if (prices[target] !== undefined) return prices[target]!;
  const earlier = Object.keys(prices)
    .filter((d) => d <= target)
    .sort();
  const last = earlier.at(-1);
  return last === undefined ? null : prices[last]!;
}
