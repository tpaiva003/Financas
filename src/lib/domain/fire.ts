/**
 * Calculadora FIRE (independência financeira).
 *
 * A ideia: quando o património rende o suficiente para pagar o ano todo,
 * trabalhar passa a ser opcional. O número mágico é o gasto anual a dividir
 * pela taxa de levantamento segura (a regra dos 4% é o ponto de partida
 * habitual, e é ajustável porque não é lei da física).
 *
 * Tudo em cêntimos e em termos REAIS (já descontada a inflação): assim o
 * "gasto anual" de hoje continua a valer o mesmo daqui a vinte anos, e não é
 * preciso projetar salários.
 *
 * Lógica pura, sem acesso a dados.
 */

export interface FireInput {
  /** Património líquido de hoje, em cêntimos. Pode ser negativo. */
  netWorthCents: number;
  /** Gasto anual, em cêntimos. */
  annualExpensesCents: number;
  /** Quanto se poupa por mês, em cêntimos. */
  monthlySavingsCents: number;
  /** Taxa de levantamento segura, em percentagem (default 4). */
  withdrawalRatePct?: number;
  /** Retorno real anual esperado, em percentagem (default 5). */
  realReturnPct?: number;
}

export interface FireResult {
  /** Património necessário para viver dos rendimentos. */
  fireNumberCents: number;
  /** Quanto falta (0 se já lá está). */
  remainingCents: number;
  /** Percentagem do caminho já feita. */
  progressPct: number;
  /** Anos até lá, com a poupança e o retorno indicados. Null se nunca chegar. */
  yearsToFire: number | null;
  /** Ano de calendário em que se atinge, se houver. */
  targetYear: number | null;
  /**
   * "Coast FIRE": quanto seria preciso ter HOJE para chegar ao número FIRE só
   * com juros, sem poupar mais nada até à idade alvo.
   */
  coastNumberCents: number;
  /** Já se pode parar de poupar e deixar os juros trabalhar. */
  coastReached: boolean;
  /** Rendimento mensal que o património atual já suporta. */
  currentMonthlyIncomeCents: number;
  /** Percentagem do gasto mensal já coberta pelo património. */
  expensesCoveredPct: number;
}

/** Quantos anos faltam para a idade alvo do coast FIRE. */
export const DEFAULT_COAST_YEARS = 20;

export function buildFire(input: FireInput, today = new Date()): FireResult {
  const swr = (input.withdrawalRatePct ?? 4) / 100;
  const rate = (input.realReturnPct ?? 5) / 100;
  const annual = Math.max(0, input.annualExpensesCents);
  const net = input.netWorthCents;
  const yearlySavings = input.monthlySavingsCents * 12;

  // Sem gasto anual não há alvo: é o gasto que define quanto é "suficiente".
  const fireNumberCents = swr > 0 ? Math.round(annual / swr) : 0;
  const remainingCents = Math.max(0, fireNumberCents - net);
  const progressPct = fireNumberCents > 0 ? Math.min(100, (net / fireNumberCents) * 100) : 0;

  const currentMonthlyIncomeCents = Math.round((Math.max(0, net) * swr) / 12);
  const monthlyExpenses = annual / 12;
  const expensesCoveredPct =
    monthlyExpenses > 0 ? Math.min(100, (currentMonthlyIncomeCents / monthlyExpenses) * 100) : 0;

  const yearsToFire = yearsUntil(net, fireNumberCents, yearlySavings, rate);
  const targetYear =
    yearsToFire === null ? null : today.getUTCFullYear() + Math.ceil(yearsToFire);

  // Coast FIRE: valor presente do número FIRE, descontado à taxa de retorno.
  const coastNumberCents =
    rate > 0
      ? Math.round(fireNumberCents / Math.pow(1 + rate, DEFAULT_COAST_YEARS))
      : fireNumberCents;

  return {
    fireNumberCents,
    remainingCents,
    progressPct,
    yearsToFire,
    targetYear,
    coastNumberCents,
    coastReached: net >= coastNumberCents && fireNumberCents > 0,
    currentMonthlyIncomeCents,
    expensesCoveredPct,
  };
}

/**
 * Anos até o património atingir o alvo, com aportes anuais e juro composto.
 *
 * Resolve-se ano a ano em vez de por fórmula fechada: é exato para o caso de
 * retorno zero, aguenta património negativo (dívidas) e evita logaritmos de
 * números negativos.
 */
export function yearsUntil(
  currentCents: number,
  targetCents: number,
  yearlySavingsCents: number,
  rate: number,
  maxYears = 100,
): number | null {
  if (targetCents <= 0) return 0;
  if (currentCents >= targetCents) return 0;
  // Sem poupança e sem retorno (ou já a perder), nunca lá chega.
  if (yearlySavingsCents <= 0 && (rate <= 0 || currentCents <= 0)) return null;

  let value = currentCents;
  for (let year = 1; year <= maxYears; year++) {
    value = value * (1 + rate) + yearlySavingsCents;
    if (value >= targetCents) {
      // Interpolação dentro do ano, para não arredondar sempre para cima.
      const previous = (value - yearlySavingsCents) / (1 + rate);
      const gap = value - previous;
      const fraction = gap > 0 ? (targetCents - previous) / gap : 0;
      return year - 1 + Math.min(1, Math.max(0, fraction));
    }
  }
  return null;
}
