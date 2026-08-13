/**
 * O que falta pagar hoje, calculado a partir do contrato.
 *
 * **O problema que isto resolve.** O formulário pedia "quanto falta pagar" — um
 * número que ninguém tem de cabeça e que obriga a ir ao mapa de
 * responsabilidades do banco. E é o número de que tudo depende: o património
 * líquido, o plano de amortização, o líquido do imóvel. Quem o escreve por alto
 * fica com a app inteira por alto.
 *
 * **O contrato, esse, sabe-se.** O montante que se pediu, o dia em que começou,
 * a taxa e o prazo estão na escritura, são fixos, e não mudam com o tempo. A
 * partir deles o capital em dívida de hoje é uma conta — a mesma conta que o
 * banco faz — e não um palpite.
 *
 * **Amortiza-se mês a mês, e não por fórmula fechada.** Com taxa mista a
 * prestação é recalculada em cada mudança de período, e uma fórmula única daria
 * o número de um crédito que não é este. Mês a mês é mais lento e é o que
 * corresponde ao que aconteceu na conta.
 *
 * **É uma estimativa, e o ecrã tem de o dizer.** Não sabe de amortizações
 * antecipadas, de meses de carência, de comissões nem de arredondamentos do
 * banco. Serve para não se começar do zero — o valor do banco, quando existe,
 * ganha sempre.
 *
 * Lógica pura, sem acesso a dados.
 */

import { effectiveRatePct, monthsBetween, prestacaoAnuidadeCents } from "./credito";
import type { IndexanteRates, RatePeriod } from "./credito";

export interface CapitalEmDivida {
  /** O que falta pagar na data pedida, em cêntimos. */
  balanceCents: number;
  /** Quanto já se amortizou de capital desde o início. */
  amortizadoCents: number;
  /** Juros pagos até aqui, na simulação. */
  jurosPagosCents: number;
  /** Quantos meses já foram pagos. */
  mesesPagos: number;
  /** A prestação em vigor na data pedida. */
  prestacaoCents: number;
}

export type CapitalSaida = { ok: CapitalEmDivida } | { erro: string };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Quanto falta pagar numa data, partindo do montante contratado.
 *
 * `atDate` é normalmente hoje. Devolve um erro por extenso em vez de um número
 * quando falta alguma coisa: um capital em dívida errado propaga-se ao
 * património líquido inteiro, e um zero silencioso lê-se como um crédito pago.
 */
export function capitalEmDividaEm(input: {
  /** O montante do contrato, em cêntimos. Não é o que falta — é o que se pediu. */
  principalCents: number;
  /** O dia em que o crédito começou. "AAAA-MM-DD". */
  contractStart: string;
  /** O último pagamento. "AAAA-MM-DD". */
  maturityDate: string;
  periods: RatePeriod[];
  indexanteRates: IndexanteRates;
  /** A data para a qual se quer o saldo. "AAAA-MM-DD". */
  atDate: string;
}): CapitalSaida {
  const principal = Math.round(input.principalCents);
  if (!Number.isFinite(principal) || principal <= 0) {
    return { erro: "Falta o montante contratado." };
  }
  if (!DATA.test(input.contractStart)) return { erro: "Falta a data de início do contrato." };
  if (!DATA.test(input.maturityDate)) return { erro: "Falta a maturidade." };
  if (!DATA.test(input.atDate)) return { erro: "Data inválida." };
  if (input.maturityDate <= input.contractStart) {
    return { erro: "A maturidade é anterior ao início do contrato." };
  }
  if (input.periods.length === 0) return { erro: "Sem períodos de taxa definidos." };

  const prazoTotal = monthsBetween(input.contractStart, input.maturityDate);
  if (prazoTotal <= 0) return { erro: "O prazo do contrato dá zero meses." };

  const decorridos = monthsBetween(input.contractStart, input.atDate);
  // Ainda não houve prestação nenhuma: deve-se tudo o que se pediu.
  if (decorridos <= 0) {
    const taxa0 = taxaEm(input.contractStart, input.periods, input.indexanteRates);
    if (taxa0 === null) return { erro: "Falta o valor do indexante para o primeiro período." };
    return {
      ok: {
        balanceCents: principal,
        amortizadoCents: 0,
        jurosPagosCents: 0,
        mesesPagos: 0,
        prestacaoCents: prestacaoAnuidadeCents(principal, taxa0, prazoTotal),
      },
    };
  }

  // Já passou o prazo todo: está pago, e dizer outra coisa seria inventar dívida.
  const mesesAPagar = Math.min(decorridos, prazoTotal);

  let saldo = principal;
  let juros = 0;
  let prestacao = 0;
  let taxaAnterior: number | null = null;

  for (let m = 0; m < mesesAPagar; m++) {
    const mes = addMonths(input.contractStart, m);
    const taxa = taxaEm(mes, input.periods, input.indexanteRates);
    if (taxa === null) {
      return {
        erro: `Falta o valor do indexante para o período que vale em ${mes.slice(0, 7)}.`,
      };
    }

    // A prestação recalcula-se quando a taxa muda — é isso que faz o degrau num
    // crédito de taxa mista, e usar a primeira até ao fim dava outro crédito.
    if (taxa !== taxaAnterior) {
      prestacao = prestacaoAnuidadeCents(saldo, taxa, prazoTotal - m);
      taxaAnterior = taxa;
    }

    const jurosDoMes = Math.round((saldo * (taxa / 100)) / 12);
    // A última prestação nunca deixa saldo negativo: fecha o que falta.
    const amortizado = Math.min(Math.max(prestacao - jurosDoMes, 0), saldo);
    saldo -= amortizado;
    juros += jurosDoMes;
    if (saldo <= 0) {
      saldo = 0;
      break;
    }
  }

  return {
    ok: {
      balanceCents: saldo,
      amortizadoCents: principal - saldo,
      jurosPagosCents: juros,
      mesesPagos: mesesAPagar,
      prestacaoCents: prestacao,
    },
  };
}

/** A taxa que vale numa data: o último período que já começou. */
function taxaEm(
  data: string,
  periods: RatePeriod[],
  rates: IndexanteRates,
): number | null {
  const ordenados = [...periods].sort((a, b) =>
    a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0,
  );
  let vigente: RatePeriod | null = null;
  for (const p of ordenados) {
    if (p.startsOn <= data) vigente = p;
  }
  // Antes do primeiro período vale o primeiro: um contrato não anda sem taxa, e
  // recusar aqui seria recusar um crédito cujo primeiro período foi escrito com
  // a data da primeira revisão em vez da da escritura.
  const escolhido = vigente ?? ordenados[0] ?? null;
  return escolhido ? effectiveRatePct(escolhido, rates) : null;
}

/** "AAAA-MM-DD" mais N meses, sem sair do fim do mês. */
function addMonths(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(a!, (m! - 1) + n, 1));
  // O dia 31 num mês de 30 recuaria para o mês seguinte com `setUTCDate`.
  const ultimoDia = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d!, ultimoDia));
  return base.toISOString().slice(0, 10);
}
