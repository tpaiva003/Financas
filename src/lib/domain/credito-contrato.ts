/**
 * O que sai de um contrato de crédito à habitação, depois de verificado.
 *
 * **O que este ficheiro NÃO faz.** Não lê o contrato. Quem lê é um modelo, que
 * é bom a encontrar "TAN de 3,30%" no meio de trinta páginas de escritura e é
 * capaz de trocar uma vírgula de sítio sem dar por isso. O que chega aqui é uma
 * proposta com o formato certo e o conteúdo por provar.
 *
 * **Porque é que isto tem de existir.** Um crédito à habitação errado não dá
 * erro nenhum: dá uma prestação plausível, um plano com trinta anos de linhas e
 * um total de juros a seis dígitos que ninguém tem como conferir de cabeça.
 * Uma taxa lida como 0,33% em vez de 3,3% passa despercebida para sempre. Por
 * isso nada do que o modelo diz entra sozinho: cada campo passa por limites de
 * bom senso e, quando o contrato diz a prestação, ela é **recalculada** a
 * partir do capital, da taxa e do prazo extraídos e comparada com a que lá
 * está. Um capital, uma taxa ou um prazo mal lidos não sobrevivem a essa conta.
 *
 * **O que se recusa a fazer.** O valor do indexante à data da escritura está
 * quase sempre no contrato, e seria fácil aproveitá-lo. Não se aproveita: a
 * Euribor de 2019 não é a de hoje, e um plano de amortização feito sobre ela
 * seria um cenário com ar de facto, exatamente o que esta app já pagou para
 * aprender a não fazer. O campo fica vazio e quem regista escreve o de hoje.
 *
 * Lógica pura, sem rede e sem modelo.
 */

import { addMonths } from "./import-reminders";
import {
  INDEXANTES,
  monthsBetween,
  prestacaoAnuidadeCents,
  type CreditTerms,
  type Indexante,
  type RatePeriod,
} from "./credito";

/** Uma data "AAAA-MM-DD" e mais nada. */
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Limites de bom senso. Não são regras de negócio — são a diferença entre um
 * número mal lido e um número absurdo, e só apanham o segundo. Um capital de
 * 1 500 € num crédito à habitação é estranho mas possível; 3 € não é.
 */
const CAPITAL_MIN_CENTS = 100_00;
const CAPITAL_MAX_CENTS = 50_000_000_00;
const TAXA_MAX_PCT = 25;
const SPREAD_MIN_PCT = -1;
const SPREAD_MAX_PCT = 10;
const PRAZO_MAX_MESES = 600;

/** A prestação recalculada pode afastar-se isto da que o contrato diz. */
const TOLERANCIA_RACIO = 0.02;
const TOLERANCIA_MINIMA_CENTS = 200;

/** O que o modelo devolve: o formato é garantido, o conteúdo não. */
export interface ContratoBruto {
  capitalEur?: number | null;
  dataInicio?: string | null;
  dataMaturidade?: string | null;
  prazoMeses?: number | null;
  prestacaoInicialEur?: number | null;
  periodos?: Array<{
    /** Meses desde o início do contrato. 0 é o primeiro período. */
    inicioMesDoContrato?: number | null;
    dataInicio?: string | null;
    tipo?: string | null;
    taxaPct?: number | null;
    indexante?: string | null;
    spreadPct?: number | null;
  }> | null;
}

/** A conta que confirma (ou desmente) o que foi lido. */
export interface ConfirmacaoPrestacao {
  calculadaCents: number;
  contratoCents: number;
  difCents: number;
  bate: boolean;
}

export interface ContratoRevisto {
  /** O montante emprestado — não o que falta pagar hoje. */
  capitalCents: number | null;
  startDate: string | null;
  maturityDate: string | null;
  terms: CreditTerms | null;
  /** A prestação que o contrato diz, quando diz. */
  statedPaymentCents: number | null;
  confirmacao: ConfirmacaoPrestacao | null;
  /** O que quem confirma tem mesmo de olhar. Nunca se corrige em silêncio. */
  avisos: string[];
  /** Dá para preencher o formulário com isto? */
  usable: boolean;
}

function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function data(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.slice(0, 10);
  if (!DATA.test(d)) return null;
  // Uma data com o formato certo e o mês 19 passa no regex e não existe.
  const [y, m, dd] = d.split("-").map(Number) as [number, number, number];
  if (m < 1 || m > 12 || dd < 1 || dd > 31) return null;
  return d;
}

function euroParaCentimos(v: unknown): number | null {
  const n = numero(v);
  if (n === null) return null;
  return Math.round(n * 100);
}

/**
 * A data em que um período começa: a que o modelo deu, ou a que sai de contar
 * meses desde o início. Sem uma nem outra, o período não tem quando.
 */
function inicioDoPeriodo(
  p: NonNullable<ContratoBruto["periodos"]>[number],
  startDate: string,
): string | null {
  const explicita = data(p.dataInicio);
  if (explicita) return explicita;
  const meses = numero(p.inicioMesDoContrato);
  if (meses === null || meses < 0 || meses > PRAZO_MAX_MESES) return null;
  return addMonths(startDate, Math.round(meses));
}

/**
 * Verificar o que o modelo leu do contrato.
 *
 * Devolve sempre, nunca atira. O que não passa é **deitado fora com aviso**, em
 * vez de corrigido: adivinhar a taxa certa a partir de uma taxa errada é
 * escolher por alguém um número que vai valer trinta anos.
 */
export function reviewContrato(bruto: ContratoBruto): ContratoRevisto {
  const avisos: string[] = [];

  let capitalCents = euroParaCentimos(bruto.capitalEur);
  if (capitalCents !== null && (capitalCents < CAPITAL_MIN_CENTS || capitalCents > CAPITAL_MAX_CENTS)) {
    avisos.push("O montante do empréstimo que li não faz sentido; ficou por preencher.");
    capitalCents = null;
  }

  const startDate = data(bruto.dataInicio);
  if (!startDate) avisos.push("Não encontrei a data de início do contrato.");

  // A maturidade pode vir dita ou vir do prazo. Quando vêm as duas e não batem
  // certo, é sinal de que uma delas foi mal lida — e não se escolhe qual.
  const maturidadeDita = data(bruto.dataMaturidade);
  const prazo = numero(bruto.prazoMeses);
  const prazoValido = prazo !== null && prazo > 0 && prazo <= PRAZO_MAX_MESES ? Math.round(prazo) : null;
  const maturidadeDoPrazo = startDate && prazoValido !== null ? addMonths(startDate, prazoValido) : null;

  let maturityDate = maturidadeDita ?? maturidadeDoPrazo;
  if (maturidadeDita && maturidadeDoPrazo) {
    const diferenca = Math.abs(monthsBetween(maturidadeDoPrazo, maturidadeDita));
    if (diferenca > 1) {
      avisos.push(
        `O contrato diz ${prazoValido} meses de prazo, o que dá ${maturidadeDoPrazo}, mas a data de fim que li é ${maturidadeDita}. Confirma qual está certa.`,
      );
    }
  }
  if (maturityDate && startDate && maturityDate <= startDate) {
    avisos.push("A data de fim que li é anterior ao início; ficou por preencher.");
    maturityDate = null;
  }
  if (!maturityDate) avisos.push("Não consegui apurar a data do último pagamento.");

  const periods: RatePeriod[] = [];
  const brutos = Array.isArray(bruto.periodos) ? bruto.periodos : [];
  let descartados = 0;

  for (const p of brutos) {
    if (!p || typeof p !== "object" || !startDate) {
      descartados++;
      continue;
    }
    const startsOn = inicioDoPeriodo(p, startDate);
    const tipo = p.tipo === "fixa" || p.tipo === "variavel" ? p.tipo : null;
    if (!startsOn || !tipo) {
      descartados++;
      continue;
    }

    if (tipo === "fixa") {
      const taxa = numero(p.taxaPct);
      if (taxa === null || taxa < 0 || taxa > TAXA_MAX_PCT) {
        descartados++;
        continue;
      }
      periods.push({ startsOn, kind: "fixa", ratePct: taxa, indexante: null, spreadPct: null });
      continue;
    }

    const indexante =
      typeof p.indexante === "string" && p.indexante in INDEXANTES ? (p.indexante as Indexante) : null;
    const spread = numero(p.spreadPct);
    if (!indexante || spread === null || spread < SPREAD_MIN_PCT || spread > SPREAD_MAX_PCT) {
      descartados++;
      continue;
    }
    periods.push({ startsOn, kind: "variavel", ratePct: null, indexante, spreadPct: spread });
  }

  if (descartados > 0) {
    avisos.push(
      descartados === 1
        ? "Um período de taxa saiu incompleto e foi deitado fora: confirma se falta algum."
        : `${descartados} períodos de taxa saíram incompletos e foram deitados fora: confirma se falta algum.`,
    );
  }

  periods.sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0));

  // Dois períodos a começar no mesmo dia é uma contradição, não uma escolha.
  const unicos: RatePeriod[] = [];
  for (const p of periods) {
    if (unicos.length > 0 && unicos[unicos.length - 1]!.startsOn === p.startsOn) {
      avisos.push(`Havia dois períodos a começar em ${p.startsOn}; fiquei com o primeiro.`);
      continue;
    }
    unicos.push(p);
  }

  const uteis = maturityDate ? unicos.filter((p) => p.startsOn < maturityDate!) : unicos;
  if (uteis.length < unicos.length) {
    avisos.push("Havia períodos a começar depois do fim do crédito; foram ignorados.");
  }

  if (uteis.length === 0) {
    avisos.push("Não consegui apurar nenhum período de taxa.");
  } else if (startDate && uteis[0]!.startsOn > startDate) {
    // Um buraco entre a escritura e o primeiro período deixaria meses sem taxa
    // nenhuma, e o plano começaria mais tarde do que o crédito sem o dizer.
    avisos.push(
      `O primeiro período de taxa só começa em ${uteis[0]!.startsOn}, depois do início do contrato. Confirma a data.`,
    );
  }

  /**
   * O indexante fica de propósito por preencher. Ver o cabeçalho: o valor que
   * está no contrato é o do dia da escritura, e usá-lo hoje daria um plano
   * inteiro construído sobre um número que já não é verdade.
   */
  const terms: CreditTerms | null = uteis.length > 0 ? { periods: uteis, indexanteRates: {} } : null;
  if (uteis.some((p) => p.kind === "variavel")) {
    avisos.push(
      "Há períodos de taxa variável. O valor do indexante fica por preencher de propósito: o que está no contrato é o do dia da escritura, e o plano tem de ser feito com o de hoje.",
    );
  }

  const statedPaymentCents = euroParaCentimos(bruto.prestacaoInicialEur);

  /**
   * A conta que confirma o resto. Se o capital, a taxa do primeiro período e o
   * prazo estiverem certos, a anuidade tem de dar perto da prestação que o
   * contrato imprime. Se não der, um dos três foi mal lido — e é muito melhor
   * dizê-lo do que gravar um plano de trinta anos em cima de um erro.
   */
  let confirmacao: ConfirmacaoPrestacao | null = null;
  const primeiro = uteis[0];
  if (
    statedPaymentCents !== null &&
    statedPaymentCents > 0 &&
    capitalCents !== null &&
    startDate &&
    maturityDate &&
    primeiro &&
    primeiro.kind === "fixa" &&
    typeof primeiro.ratePct === "number"
  ) {
    const meses = monthsBetween(startDate, maturityDate);
    if (meses > 0) {
      const calculadaCents = prestacaoAnuidadeCents(capitalCents, primeiro.ratePct, meses);
      const difCents = calculadaCents - statedPaymentCents;
      const folga = Math.max(Math.round(statedPaymentCents * TOLERANCIA_RACIO), TOLERANCIA_MINIMA_CENTS);
      const bate = Math.abs(difCents) <= folga;
      confirmacao = { calculadaCents, contratoCents: statedPaymentCents, difCents, bate };
      if (!bate) {
        avisos.push(
          difCents < 0
            ? "A prestação que o contrato diz é maior do que a que sai das contas. Costuma ser dos seguros, que vão na mesma prestação e não no crédito, mas confirma a taxa e o prazo."
            : "A prestação que sai das contas é maior do que a que o contrato diz. Alguma coisa foi mal lida: confirma o montante, a taxa e o prazo antes de gravar.",
        );
      }
    }
  }

  return {
    capitalCents,
    startDate,
    maturityDate,
    terms,
    statedPaymentCents,
    confirmacao,
    avisos,
    usable: capitalCents !== null && startDate !== null && maturityDate !== null && terms !== null,
  };
}
