/**
 * Crédito à habitação com períodos de taxa: fixa, mista, variável.
 *
 * **Porquê não chega uma taxa só.** Um crédito português típico não tem uma
 * taxa — tem duas ou três, com datas: "3 anos fixa a 3,3%, depois Euribor 6M +
 * 0,9% até 2055". O `buildLoan` só sabe uma, e por isso mostra até ao fim uma
 * prestação que deixa de ser verdade no dia em que o período fixo acaba. Um
 * número com ar de resposta em que ninguém desconfia é o modo de falha que esta
 * app já pagou para aprender.
 *
 * **Como se calcula.** A cada mudança de taxa, o banco recalcula a prestação
 * como anuidade sobre o **capital que sobra** e os **meses que faltam até à
 * maturidade** — não sobre o capital inicial nem sobre o prazo original. É isso
 * que faz o degrau na prestação, e é isso que se faz aqui.
 *
 * **O futuro do indexante não se inventa.** A Euribor daqui a três anos não se
 * sabe, e estimá-la seria produzir um plano com ar de facto. Usa-se o valor
 * atual, o plano diz que é um cenário, e a que valor foi feito. Quem quiser
 * outro cenário muda o valor e vê o plano mudar — o que é honesto e útil; um
 * número escondido não é nem uma coisa nem outra.
 *
 * Lógica pura, sem rede.
 */

/** Os indexantes que a app conhece, com o nome por extenso. */
export const INDEXANTES = {
  euribor3m: "Euribor a 3 meses",
  euribor6m: "Euribor a 6 meses",
  euribor12m: "Euribor a 12 meses",
} as const;

export type Indexante = keyof typeof INDEXANTES;

export type PeriodoTipo = "fixa" | "variavel";

export const PERIODO_TIPO_LABELS: Record<PeriodoTipo, string> = {
  fixa: "Taxa fixa",
  variavel: "Taxa variável",
};

/**
 * Um troço do crédito com a mesma regra de taxa.
 *
 * O período vai daqui até ao início do seguinte, ou até à maturidade se for o
 * último. Não se guarda data de fim de propósito: guardá-la nos dois sítios era
 * garantir que um dia deixavam de bater certo.
 */
export interface RatePeriod {
  /** "AAAA-MM-DD". Quando esta regra passa a valer. */
  startsOn: string;
  kind: PeriodoTipo;
  /** Taxa anual, em percentagem. Só nas fixas. */
  ratePct?: number | null;
  /** Só nas variáveis. */
  indexante?: Indexante | null;
  /** Margem do banco sobre o indexante, em pontos percentuais. */
  spreadPct?: number | null;
}

/** Uma data "AAAA-MM-DD" e mais nada. */
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** O valor atual de cada indexante, em percentagem. */
export type IndexanteRates = Partial<Record<Indexante, number>>;

/**
 * A taxa anual que um período vale, em percentagem.
 *
 * Devolve `null` quando não dá para saber — numa variável sem o valor do
 * indexante, por exemplo. Nunca assume zero: zero é uma taxa e daria um plano
 * inteiro sem juros, que é pior do que não haver plano.
 */
export function effectiveRatePct(p: RatePeriod, rates: IndexanteRates): number | null {
  if (p.kind === "fixa") {
    return typeof p.ratePct === "number" && p.ratePct >= 0 ? p.ratePct : null;
  }
  const base = p.indexante ? rates[p.indexante] : undefined;
  if (typeof base !== "number") return null;
  const spread = typeof p.spreadPct === "number" ? p.spreadPct : 0;
  const total = base + spread;
  return total >= 0 ? total : 0;
}

/** Meses inteiros entre duas datas "AAAA-MM-DD". Negativo se a segunda for antes. */
export function monthsBetween(from: string, to: string): number {
  const [ay, am, ad] = from.slice(0, 10).split("-").map(Number) as [number, number, number];
  const [by, bm, bd] = to.slice(0, 10).split("-").map(Number) as [number, number, number];
  let meses = (by - ay) * 12 + (bm - am);
  // Um mês só conta quando o dia já passou: de 15/01 a 10/02 ainda não é um mês.
  if (bd < ad) meses -= 1;
  return meses;
}

/** Um troço do plano, com a prestação que vigora nele. */
export interface TramoPlano {
  startsOn: string;
  /** Quantos meses este troço dura no plano. */
  months: number;
  /** A taxa anual usada, em percentagem. */
  annualRatePct: number;
  /** De onde veio a taxa, para se poder mostrar. */
  origem: { kind: PeriodoTipo; indexante?: Indexante | null; spreadPct?: number | null };
  /** A prestação recalculada no início do troço. */
  monthlyPaymentCents: number;
  /** Capital em dívida quando o troço começa. */
  openingBalanceCents: number;
  /** Capital em dívida quando acaba. */
  closingBalanceCents: number;
  /** Juros pagos durante o troço. */
  interestCents: number;
}

export interface CreditoPlano {
  tramos: TramoPlano[];
  /** Juros do princípio ao fim, em cêntimos. */
  totalInterestCents: number;
  /** A prestação que vigora hoje. */
  currentPaymentCents: number | null;
  /** A prestação do troço seguinte, quando há um. Serve para avisar do degrau. */
  nextPaymentCents: number | null;
  /** Quando muda. */
  nextChangeOn: string | null;
  /** Porque é que não há plano, quando não há. */
  problem: string | null;
  /**
   * A partir daqui o plano é um CENÁRIO, não uma previsão: assenta no valor de
   * hoje do indexante, que ninguém sabe qual será.
   */
  scenarioFrom: string | null;
}

const SEM_PLANO = (problem: string): CreditoPlano => ({
  tramos: [],
  totalInterestCents: 0,
  currentPaymentCents: null,
  nextPaymentCents: null,
  nextChangeOn: null,
  problem,
  scenarioFrom: null,
});

/** Prestação de anuidade sobre o capital e os meses que faltam. */
function prestacao(principalCents: number, annualRatePct: number, months: number): number {
  if (months <= 0 || principalCents <= 0) return 0;
  const i = annualRatePct / 100 / 12;
  if (i === 0) return Math.round(principalCents / months);
  return Math.round((principalCents * i) / (1 - Math.pow(1 + i, -months)));
}

/**
 * O plano de amortização, com a prestação a mudar em cada período.
 *
 * `startDate` é a data a partir da qual se conta (normalmente hoje), e
 * `balanceCents` é o capital que falta pagar nessa data — não o montante
 * original do empréstimo.
 */
export function buildCreditoPlano(input: {
  balanceCents: number;
  /** "AAAA-MM-DD". */
  startDate: string;
  /** Último pagamento. "AAAA-MM-DD". */
  maturityDate: string | null | undefined;
  periods: RatePeriod[];
  indexanteRates: IndexanteRates;
}): CreditoPlano {
  const saldoInicial = Math.round(input.balanceCents);
  if (saldoInicial <= 0) return SEM_PLANO("Sem capital em dívida.");
  if (input.periods.length === 0) return SEM_PLANO("Sem períodos de taxa definidos.");

  /**
   * Sem maturidade não há plano — e dizê-lo é melhor do que voltar em silêncio
   * ao cálculo de taxa única, que mostraria a prestação de hoje até ao fim do
   * prazo num crédito que se sabe que muda de taxa.
   */
  const maturidade = input.maturityDate ?? "";
  if (!DATA.test(maturidade)) {
    return SEM_PLANO("Falta a maturidade: sem a data do último pagamento não há prestação para calcular.");
  }

  const mesesTotais = monthsBetween(input.startDate, maturidade);
  if (mesesTotais <= 0) return SEM_PLANO("A maturidade já passou.");

  // Por data, e só os que interessam: um período que começa depois da
  // maturidade nunca chega a valer.
  const ordenados = [...input.periods]
    .sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0))
    .filter((p) => p.startsOn < maturidade);
  if (ordenados.length === 0) return SEM_PLANO("Todos os períodos começam depois da maturidade.");

  const tramos: TramoPlano[] = [];
  let saldo = saldoInicial;
  let totalJuros = 0;
  let scenarioFrom: string | null = null;

  for (let k = 0; k < ordenados.length; k++) {
    const p = ordenados[k]!;
    // Um período que já começou conta a partir de hoje, não da sua data.
    const inicio = p.startsOn < input.startDate ? input.startDate : p.startsOn;

    // Já não há nada a pagar: os períodos seguintes não chegam a existir.
    if (saldo <= 0) break;

    const seguinte = ordenados[k + 1];
    const fim = seguinte && seguinte.startsOn < maturidade ? seguinte.startsOn : maturidade;
    const mesesTramo = monthsBetween(inicio, fim);
    if (mesesTramo <= 0) continue;

    const taxa = effectiveRatePct(p, input.indexanteRates);
    if (taxa === null) {
      return SEM_PLANO(
        p.kind === "variavel"
          ? `Falta o valor do indexante ${p.indexante ? INDEXANTES[p.indexante] : ""} para calcular o período que começa em ${p.startsOn}.`.replace("  ", " ")
          : `Falta a taxa do período que começa em ${p.startsOn}.`,
      );
    }

    // Uma variável assenta no indexante de HOJE. Daí para a frente é cenário.
    if (p.kind === "variavel" && scenarioFrom === null) scenarioFrom = inicio;

    // A prestação recalcula-se sobre o que falta pagar e os meses que faltam
    // ATÉ À MATURIDADE — é isso que o banco faz, e é o que cria o degrau.
    const mesesAteMaturidade = monthsBetween(inicio, maturidade);
    const pagamento = prestacao(saldo, taxa, mesesAteMaturidade);

    const abertura = saldo;
    let jurosTramo = 0;
    const i = taxa / 100 / 12;
    const ateAoFim = fim === maturidade;

    for (let m = 0; m < mesesTramo && saldo > 0; m++) {
      const juro = Math.round(saldo * i);
      const devido = saldo + juro;
      /**
       * A prestação é a anuidade arredondada ao cêntimo, e ao fim de trezentas
       * e tal vezes esse arredondamento deixa um resto — uns cêntimos, às vezes
       * alguns euros. Num crédito real a última prestação é ajustada e salda
       * tudo; arrastar o resto para um mês 361 que o contrato não tem seria
       * inventar uma prestação a mais.
       */
      const ultima = ateAoFim && m === mesesTramo - 1;
      const pago = ultima ? devido : Math.min(pagamento, devido);
      jurosTramo += juro;
      saldo = devido - pago;
      // Uma prestação que não cobre o juro faz a dívida crescer: dizer isso é
      // mais útil do que devolver um plano que nunca acaba.
      if (pago <= juro && m > 2) {
        return SEM_PLANO(
          `A prestação do período que começa em ${p.startsOn} não cobre os juros: a dívida cresceria.`,
        );
      }
    }

    totalJuros += jurosTramo;
    tramos.push({
      startsOn: inicio,
      months: mesesTramo,
      annualRatePct: taxa,
      origem: { kind: p.kind, indexante: p.indexante ?? null, spreadPct: p.spreadPct ?? null },
      monthlyPaymentCents: pagamento,
      openingBalanceCents: abertura,
      closingBalanceCents: saldo,
      interestCents: jurosTramo,
    });
  }

  if (tramos.length === 0) return SEM_PLANO("Não há período nenhum a decorrer.");

  const atual = tramos[0]!;
  const proximo = tramos[1] ?? null;

  return {
    tramos,
    totalInterestCents: totalJuros,
    currentPaymentCents: atual.monthlyPaymentCents,
    nextPaymentCents: proximo ? proximo.monthlyPaymentCents : null,
    nextChangeOn: proximo ? proximo.startsOn : null,
    problem: null,
    scenarioFrom,
  };
}

/** Os períodos e os valores dos indexantes, como ficam guardados no ativo. */
export interface CreditTerms {
  periods: RatePeriod[];
  indexanteRates: IndexanteRates;
}

function numeroOuNulo(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Ler os termos guardados, sem acreditar neles.
 *
 * Isto vem de uma coluna `jsonb`, que o Postgres devolve tal e qual foi lá
 * posto — por esta versão da app ou por outra qualquer. Um `as unknown as
 * CreditTerms` daria um objeto com o tipo certo e o conteúdo que calhasse, e
 * daí saía um plano de amortização com números a sério e origem duvidosa. É o
 * mesmo erro que os mapeamentos de importação já pagaram.
 *
 * Um período só entra se trouxer data válida e um tipo conhecido. Os que não
 * trazem são deitados fora em vez de corrigidos: adivinhar aqui era escolher
 * uma taxa por alguém.
 */
export function parseCreditTerms(raw: unknown): CreditTerms | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const brutos = Array.isArray(obj.periods) ? obj.periods : null;
  if (!brutos) return null;

  const periods: RatePeriod[] = [];
  for (const item of brutos) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const startsOn = typeof p.startsOn === "string" ? p.startsOn.slice(0, 10) : "";
    if (!DATA.test(startsOn)) continue;
    if (p.kind !== "fixa" && p.kind !== "variavel") continue;
    const indexante = typeof p.indexante === "string" && p.indexante in INDEXANTES
      ? (p.indexante as Indexante)
      : null;
    periods.push({
      startsOn,
      kind: p.kind,
      ratePct: numeroOuNulo(p.ratePct),
      indexante,
      spreadPct: numeroOuNulo(p.spreadPct),
    });
  }
  if (periods.length === 0) return null;

  const indexanteRates: IndexanteRates = {};
  const rr = obj.indexanteRates;
  if (rr && typeof rr === "object") {
    for (const chave of Object.keys(INDEXANTES) as Indexante[]) {
      const v = numeroOuNulo((rr as Record<string, unknown>)[chave]);
      if (v !== null) indexanteRates[chave] = v;
    }
  }

  return { periods, indexanteRates };
}

/**
 * Que tipo de crédito é, a partir dos períodos.
 *
 * É derivado e não escrito: se fosse um campo à parte, mais tarde ou mais cedo
 * dizia "fixa" num crédito com um período variável lá dentro.
 */
export function tipoDoCredito(periods: RatePeriod[]): "fixa" | "variavel" | "mista" | null {
  if (periods.length === 0) return null;
  const temFixa = periods.some((p) => p.kind === "fixa");
  const temVariavel = periods.some((p) => p.kind === "variavel");
  if (temFixa && temVariavel) return "mista";
  return temFixa ? "fixa" : "variavel";
}
