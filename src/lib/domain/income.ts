/**
 * Rendimento e taxa de poupança.
 *
 * Faltava metade da história. A app sabia para onde o dinheiro ia mas não de
 * onde vinha, e sem isso não há resposta para a única pergunta que interessa a
 * quem quer chegar à independência financeira: **que percentagem do que entra é
 * que fica**.
 *
 * O rendimento não é todo igual e a distinção importa:
 *
 *  - **Ativo** (salário, trabalhos paralelos) para de entrar se se parar de
 *    trabalhar.
 *  - **Passivo** (juros, dividendos, rendas) continua a entrar.
 *
 * A percentagem de despesas já coberta por rendimento passivo é o mesmo
 * indicador do FIRE, mas vindo do dinheiro real que entra, e não de uma
 * projeção sobre o património.
 *
 * Lógica pura, sem acesso a dados.
 */

export type IncomeKind = "salario" | "extra" | "juros" | "dividendos" | "renda" | "outro";

export const INCOME_KIND_LABELS: Record<IncomeKind, string> = {
  salario: "Salário",
  extra: "Trabalhos paralelos",
  juros: "Juros",
  dividendos: "Dividendos",
  renda: "Rendas",
  outro: "Outro",
};

/** Rendimento que deixa de entrar se a pessoa parar de trabalhar. */
const ACTIVE_KINDS: IncomeKind[] = ["salario", "extra"];

export function isPassive(kind: IncomeKind): boolean {
  return !ACTIVE_KINDS.includes(kind);
}

export interface IncomeEntry {
  id: string;
  kind: IncomeKind;
  description: string;
  /** Valor líquido recebido, em cêntimos. */
  amountCents: number;
  /** "YYYY-MM-DD". */
  date: string;
}

export interface SavingsRate {
  /** Mês em análise, "YYYY-MM". */
  month: string;
  incomeCents: number;
  expensesCents: number;
  /** Entrou menos saiu. Negativo quer dizer que se gastou mais do que entrou. */
  savedCents: number;
  /** Percentagem do que entrou que ficou. Null se não entrou nada. */
  ratePct: number | null;
  activeIncomeCents: number;
  passiveIncomeCents: number;
  /** Percentagem das despesas já coberta por rendimento passivo. */
  passiveCoveragePct: number | null;
  byKind: { kind: IncomeKind; label: string; amountCents: number }[];
}

/**
 * Taxa de poupança de um mês.
 *
 * A base é o **rendimento efetivamente recebido**, não um salário teórico: é
 * essa a diferença entre um número honesto e um número bonito.
 */
export function buildSavingsRate(
  income: IncomeEntry[],
  expensesCents: number,
  month: string,
): SavingsRate {
  const ofMonth = income.filter((i) => i.date.slice(0, 7) === month);

  let incomeCents = 0;
  let activeIncomeCents = 0;
  let passiveIncomeCents = 0;
  const kindTotals = new Map<IncomeKind, number>();

  for (const i of ofMonth) {
    incomeCents += i.amountCents;
    if (isPassive(i.kind)) passiveIncomeCents += i.amountCents;
    else activeIncomeCents += i.amountCents;
    kindTotals.set(i.kind, (kindTotals.get(i.kind) ?? 0) + i.amountCents);
  }

  const savedCents = incomeCents - expensesCents;

  return {
    month,
    incomeCents,
    expensesCents,
    savedCents,
    ratePct: incomeCents > 0 ? (savedCents / incomeCents) * 100 : null,
    activeIncomeCents,
    passiveIncomeCents,
    passiveCoveragePct:
      expensesCents > 0 ? Math.min(100, (passiveIncomeCents / expensesCents) * 100) : null,
    byKind: (Object.keys(INCOME_KIND_LABELS) as IncomeKind[])
      .map((kind) => ({
        kind,
        label: INCOME_KIND_LABELS[kind],
        amountCents: kindTotals.get(kind) ?? 0,
      }))
      .filter((k) => k.amountCents !== 0)
      .sort((a, b) => b.amountCents - a.amountCents),
  };
}

/**
 * Taxa de poupança média de vários meses.
 *
 * Não é a média das percentagens mensais: é o total poupado a dividir pelo
 * total recebido. A média das percentagens dá peso igual a um mês de 500 € e a
 * um mês de 5000 €, o que distorce quando há meses com subsídios ou extras.
 */
export function averageSavingsRate(
  months: { incomeCents: number; expensesCents: number }[],
): number | null {
  const income = months.reduce((s, m) => s + m.incomeCents, 0);
  if (income <= 0) return null;
  const saved = months.reduce((s, m) => s + (m.incomeCents - m.expensesCents), 0);
  return (saved / income) * 100;
}
