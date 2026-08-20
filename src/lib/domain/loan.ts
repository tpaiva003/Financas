/**
 * Juros e amortização.
 *
 * Duas perguntas que o património não respondia:
 *
 * 1. **O que é que isto rende?** Um depósito a prazo a 3% não é a mesma coisa
 *    que o mesmo dinheiro parado à ordem, e o saldo sozinho não distingue os
 *    dois. Guardando a taxa, passa a distinguir.
 * 2. **Quando é que esta dívida acaba?** Saber que faltam 120 mil não diz nada
 *    sem a prestação e a taxa. Com as três coisas, sai a data do último
 *    pagamento e quanto se paga de juros até lá.
 *
 * O cálculo da dívida é feito **mês a mês**, não pela fórmula fechada. É mais
 * lento (irrelevante: são algumas centenas de iterações) e é exato: apanha a
 * última prestação, que é quase sempre mais pequena que as outras, e evita o
 * erro de arredondamento acumulado que a fórmula introduz em cêntimos.
 *
 * A taxa guardada é a **anual nominal** (TAN). A mensal é a anual a dividir por
 * doze, que é como os bancos portugueses calculam a prestação do crédito à
 * habitação.
 *
 * Lógica pura, sem acesso a dados.
 */

import { assetValueCents, type AssetInput } from "./networth";
import { buildCreditoPlano, parseCreditTerms } from "./credito";

/** Teto da simulação: 100 anos. Nenhum crédito real lá chega. */
const MAX_MONTHS = 1200;

export type RateKind = "fixa" | "variavel";

export const RATE_KIND_LABELS: Record<RateKind, string> = {
  fixa: "Taxa fixa",
  variavel: "Taxa variável",
};

export interface LoanInput {
  /** Quanto falta pagar, em cêntimos. */
  principalCents: number;
  /** Taxa anual nominal, em percentagem. */
  annualRatePct?: number | null;
  /** Meses que faltam, se souberes o prazo em vez da prestação. */
  termMonths?: number | null;
  /** Prestação mensal, em cêntimos. */
  monthlyPaymentCents?: number | null;
}

export interface LoanPlan {
  /** A prestação usada: a que foi indicada, ou a calculada a partir do prazo. */
  monthlyPaymentCents: number | null;
  /** A prestação não foi indicada, saiu do prazo e da taxa. */
  paymentIsEstimated: boolean;
  /** Quantas prestações faltam até saldar. */
  monthsToPayOff: number | null;
  /** Juros pagos do princípio ao fim, em cêntimos. */
  totalInterestCents: number | null;
  /** Da próxima prestação, quanto é juro. */
  nextInterestCents: number | null;
  /** Da próxima prestação, quanto abate mesmo à dívida. */
  nextPrincipalCents: number | null;
  /** A prestação não chega sequer para os juros: a dívida cresce sozinha. */
  neverPaysOff: boolean;
}

const EMPTY: LoanPlan = {
  monthlyPaymentCents: null,
  paymentIsEstimated: false,
  monthsToPayOff: null,
  totalInterestCents: null,
  nextInterestCents: null,
  nextPrincipalCents: null,
  neverPaysOff: false,
};

/** Taxa mensal em fração (0,03 ao ano dá 0,0025 ao mês). */
export function monthlyRate(annualRatePct?: number | null): number {
  if (!annualRatePct || annualRatePct <= 0) return 0;
  return annualRatePct / 100 / 12;
}

/**
 * Prestação de um empréstimo, pela fórmula da anuidade.
 *
 * Sem taxa, é a divisão simples do capital pelos meses.
 */
export function annuityPaymentCents(
  principalCents: number,
  annualRatePct: number | null | undefined,
  termMonths: number,
): number {
  if (termMonths <= 0 || principalCents <= 0) return 0;
  const i = monthlyRate(annualRatePct);
  if (i === 0) return Math.round(principalCents / termMonths);
  return Math.round((principalCents * i) / (1 - Math.pow(1 + i, -termMonths)));
}

export function buildLoan(input: LoanInput): LoanPlan {
  const principal = Math.round(input.principalCents);
  if (principal <= 0) return EMPTY;

  const i = monthlyRate(input.annualRatePct);
  const term = input.termMonths && input.termMonths > 0 ? Math.round(input.termMonths) : null;
  const given =
    input.monthlyPaymentCents && input.monthlyPaymentCents > 0
      ? Math.round(input.monthlyPaymentCents)
      : null;

  // A prestação real ganha ao prazo: é o que sai da conta todos os meses. O
  // prazo só serve para a estimar quando ela não foi indicada.
  const payment = given ?? (term ? annuityPaymentCents(principal, input.annualRatePct, term) : null);
  if (!payment || payment <= 0) return EMPTY;

  const nextInterestCents = Math.round(principal * i);

  // Prestação que não cobre os juros do primeiro mês: a dívida nunca desce.
  // Dizê-lo é mais útil do que devolver um prazo de mil meses.
  if (payment <= nextInterestCents) {
    return {
      ...EMPTY,
      monthlyPaymentCents: payment,
      paymentIsEstimated: given === null,
      nextInterestCents,
      nextPrincipalCents: 0,
      neverPaysOff: true,
    };
  }

  let balance = principal;
  let totalInterestCents = 0;
  let months = 0;
  while (balance > 0 && months < MAX_MONTHS) {
    const interest = Math.round(balance * i);
    const due = balance + interest;
    // A última prestação é só o que falta, não a prestação inteira.
    const paid = Math.min(payment, due);
    totalInterestCents += interest;
    balance = due - paid;
    months++;
  }

  /**
   * O tecto foi atingido: isto não é um prazo, é o fim do ciclo.
   *
   * Devolver `months` aqui apresentava `MAX_MONTHS` como se fosse uma resposta —
   * "100 anos" e uma soma de juros com seis dígitos, indistinguíveis de um
   * empréstimo que salda mesmo. O `neverPaysOff` só apanha o caso extremo em que
   * a prestação nem cobre o juro do PRIMEIRO mês; uma prestação um cêntimo acima
   * disso passa por ele e amortiza tão devagar que na prática nunca acaba.
   *
   * Sem número é melhor do que com um número inventado: `null` diz "não sei", e
   * o `neverPaysOff` diz porquê.
   */
  if (balance > 0) {
    return {
      monthlyPaymentCents: payment,
      paymentIsEstimated: given === null,
      monthsToPayOff: null,
      totalInterestCents: null,
      nextInterestCents,
      nextPrincipalCents: Math.min(payment, principal + nextInterestCents) - nextInterestCents,
      neverPaysOff: true,
    };
  }

  return {
    monthlyPaymentCents: payment,
    paymentIsEstimated: given === null,
    monthsToPayOff: months,
    totalInterestCents,
    nextInterestCents,
    nextPrincipalCents: Math.min(payment, principal + nextInterestCents) - nextInterestCents,
    neverPaysOff: false,
  };
}

/**
 * O mês em que se dá a última prestação, em "AAAA-MM".
 *
 * `months` é o número de prestações que faltam, contando a do próprio mês de
 * partida como a primeira.
 */
export function payoffMonth(fromISO: string, months: number): string | null {
  if (months <= 0) return null;
  const base = new Date(`${fromISO.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return null;
  base.setUTCMonth(base.getUTCMonth() + months - 1);
  return base.toISOString().slice(0, 7);
}

/**
 * Meses em português corrente: 342 meses não se lê, "28 anos e 6 meses" lê-se.
 */
export function formatMonths(months: number): string {
  if (months <= 0) return "0 meses";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const m = `${rest} ${rest === 1 ? "mês" : "meses"}`;
  const y = `${years} ${years === 1 ? "ano" : "anos"}`;
  if (years === 0) return m;
  if (rest === 0) return y;
  return `${y} e ${m}`;
}

/** O que um bem rende num ano à taxa indicada, em cêntimos. */
export function annualInterestCents(valueCents: number, annualRatePct?: number | null): number {
  if (!annualRatePct || valueCents <= 0) return 0;
  return Math.round((valueCents * annualRatePct) / 100);
}

export interface RateSummary {
  /** Juros que os bens com taxa rendem num ano. */
  annualInterestCents: number;
  /** Quantos bens têm taxa registada. */
  earningCount: number;
  /** Soma das prestações mensais das dívidas. */
  monthlyPaymentsCents: number;
  /** Juros que as dívidas custam no próximo ano, à taxa atual. */
  annualDebtInterestCents: number;
  /** Dívidas com prestação registada. */
  amortisingCount: number;
  /** A dívida que demora mais a acabar, para se saber quando fica tudo limpo. */
  lastPayoffMonths: number | null;
}

/**
 * Resumo das taxas de um ambiente.
 *
 * Junta as duas metades: o que o dinheiro parado rende e o que o dinheiro
 * emprestado custa. Ver as duas ao lado uma da outra é metade da decisão de
 * amortizar ou investir.
 *
 * Um crédito com períodos de taxa entra pelo plano dele, não por esta conta de
 * taxa única. Sem isso, o crédito à habitação — que é quase sempre a maior
 * dívida — não tem `monthlyPaymentCents` nenhum escrito e desaparecia do total
 * das prestações sem dizer nada, deixando lá uma soma que parecia certa.
 */
export function summariseRates(assets: AssetInput[], today?: string): RateSummary {
  const hoje = today ?? new Date().toISOString().slice(0, 10);
  let annual = 0;
  let earningCount = 0;
  let monthlyPaymentsCents = 0;
  let annualDebtInterestCents = 0;
  let amortisingCount = 0;
  let lastPayoffMonths: number | null = null;

  for (const a of assets) {
    const value = assetValueCents(a);
    if (a.kind === "divida") {
      const terms = parseCreditTerms(a.creditTerms);
      if (terms) {
        const credito = buildCreditoPlano({
          balanceCents: value,
          startDate: hoje,
          maturityDate: a.maturityDate,
          periods: terms.periods,
          indexanteRates: terms.indexanteRates,
        });
        // Sem plano não se soma nada: um crédito a que falta o valor da Euribor
        // não tem prestação nenhuma que se possa afirmar, e pôr aqui a conta de
        // taxa única era responder à pergunta errada em silêncio.
        if (!credito.problem) {
          const atual = credito.tramos[0]!;
          monthlyPaymentsCents += atual.monthlyPaymentCents;
          amortisingCount++;
          const meses = credito.tramos.reduce((s, t) => s + t.months, 0);
          lastPayoffMonths = Math.max(lastPayoffMonths ?? 0, meses);
          annualDebtInterestCents += annualInterestCents(value, atual.annualRatePct);
        }
        continue;
      }
      const plan = buildLoan({
        principalCents: value,
        annualRatePct: a.interestRatePct,
        termMonths: a.termMonths,
        monthlyPaymentCents: a.monthlyPaymentCents,
      });
      if (plan.monthlyPaymentCents) {
        monthlyPaymentsCents += plan.monthlyPaymentCents;
        amortisingCount++;
      }
      if (plan.monthsToPayOff !== null) {
        lastPayoffMonths = Math.max(lastPayoffMonths ?? 0, plan.monthsToPayOff);
      }
      // Juro do próximo ano à taxa atual, não o juro total até ao fim: é o que
      // se compara com o que o dinheiro renderia se fosse investido.
      annualDebtInterestCents += annualInterestCents(value, a.interestRatePct);
    } else if (a.interestRatePct) {
      annual += annualInterestCents(value, a.interestRatePct);
      earningCount++;
    }
  }

  return {
    annualInterestCents: annual,
    earningCount,
    monthlyPaymentsCents,
    annualDebtInterestCents,
    amortisingCount,
    lastPayoffMonths,
  };
}
