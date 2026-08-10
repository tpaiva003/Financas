/**
 * O resumo da situação financeira, para se poder falar sobre ela.
 *
 * **A regra que faz isto ser seguro: os números são todos calculados aqui.** O
 * modelo que conversa recebe este resumo já feito — em euros, com as
 * percentagens arredondadas — e não recebe a base de dados. Não soma, não
 * projeta, não calcula rendibilidades. Discute o que já está calculado por
 * código que tem testes.
 *
 * É a mesma divisão de trabalho da importação, onde a IA escolhe colunas e não
 * lê valores, e da leitura do contrato, onde copia e não calcula. A razão é a
 * de sempre: um número errado com ar de resposta é pior do que erro nenhum, e
 * "a tua taxa de poupança é 34%" é exatamente o género de frase em que ninguém
 * desconfia.
 *
 * **O que não vai no resumo.** As notas dos bens não vão — é texto livre, onde
 * cabe tudo o que alguém escreveu sem pensar que seria enviado para fora. As
 * despesas vão em média mensal e por categoria, nunca uma a uma; o extrato não
 * sai daqui.
 *
 * **Os nomes dos membros vão, e isso mudou.** A primeira versão excluía-os por
 * princípio. Estava errado para o que esta app é: metade dela é despesa
 * partilhada, e a pergunta mais óbvia que alguém faz — "quem me deve o quê?" —
 * não tem resposta possível sem nomes. São pessoas do próprio ambiente de quem
 * pergunta, que já aparecem em todos os ecrãs. O que continua de fora é tudo o
 * que não faz falta para responder.
 *
 * Lógica pura, sem rede.
 */

import { formatCents } from "./money";

/** Uma dívida, com o que se sabe do plano dela. */
export interface SituacaoDivida {
  label: string;
  balanceCents: number;
  monthlyPaymentCents: number | null;
  annualRatePct: number | null;
  /** Quando a prestação muda, num crédito com períodos de taxa. */
  nextChangeOn: string | null;
  nextPaymentCents: number | null;
}

/** Um pagamento que zeraria o saldo entre duas pessoas do ambiente. */
export interface SituacaoAcerto {
  de: string;
  para: string;
  cents: number;
}

export interface SituacaoInput {
  assetsCents: number;
  debtsCents: number;
  /** Como está o ambiente de quem pergunta: nome e saldo de cada pessoa. */
  saldos: { nome: string; netCents: number }[];
  /** Os pagamentos mínimos que zerariam tudo. */
  acertos: SituacaoAcerto[];
  /** Em que página é que a pessoa está, para se poder falar do que ela vê. */
  pagina?: string | null;
  byKind: { label: string; totalCents: number }[];
  dividas: SituacaoDivida[];
  /** Média mensal das despesas registadas. */
  monthlyExpenseCents: number | null;
  /** Rendimento mensal registado. */
  monthlyIncomeCents: number | null;
  categorias: { label: string; monthlyCents: number }[];
  investmentCostCents: number;
  investmentGainCents: number | null;
  /** A evolução, quando já há mais do que uma fotografia. */
  historico: {
    dePeriodo: string;
    aPeriodo: string;
    changeCents: number;
    changePct: number | null;
  } | null;
}

export interface Situacao extends SituacaoInput {
  netCents: number;
  /**
   * Quanto do que entra por mês não é gasto, em percentagem.
   *
   * `null` sem rendimento registado. Sem isso, a divisão por zero dava
   * `Infinity` e o ecrã mostrava uma taxa de poupança infinita a quem não
   * registou o ordenado.
   */
  savingsRatePct: number | null;
  /**
   * Quantos anos de despesa é que o património líquido cobre.
   *
   * `null` sem despesa registada — e não "infinitos anos", que é a resposta que
   * a divisão por zero dá e que soa mesmo a boa notícia.
   */
  anosDeDespesa: number | null;
  /** Que parte do que se deve é que se paga por ano em juros. */
  annualDebtInterestCents: number;
}

export function buildSituacao(input: SituacaoInput): Situacao {
  const netCents = input.assetsCents - input.debtsCents;

  const savingsRatePct =
    input.monthlyIncomeCents !== null && input.monthlyIncomeCents > 0
      ? ((input.monthlyIncomeCents - (input.monthlyExpenseCents ?? 0)) / input.monthlyIncomeCents) * 100
      : null;

  const anual = (input.monthlyExpenseCents ?? 0) * 12;
  const anosDeDespesa = anual > 0 && netCents > 0 ? netCents / anual : null;

  const annualDebtInterestCents = input.dividas.reduce(
    (s, d) =>
      s + (d.annualRatePct !== null ? Math.round((d.balanceCents * d.annualRatePct) / 100) : 0),
    0,
  );

  return { ...input, netCents, savingsRatePct, anosDeDespesa, annualDebtInterestCents };
}

function pct(n: number): string {
  return `${Math.round(n * 10) / 10}%`.replace(".", ",");
}

/**
 * O resumo em texto, para ir no pedido ao modelo.
 *
 * Tudo em euros, nunca em cêntimos: um modelo a ler "12000000" tanto pode dizer
 * doze milhões como cento e vinte mil, e a frase sai com o mesmo ar de certeza
 * nos dois casos.
 */
export function situacaoParaTexto(s: Situacao): string {
  const l: string[] = [];

  l.push(`Património líquido: ${formatCents(s.netCents)}.`);
  l.push(`Bens: ${formatCents(s.assetsCents)}. Dívidas: ${formatCents(s.debtsCents)}.`);

  if (s.byKind.length > 0) {
    l.push(
      `Onde está: ${s.byKind.map((k) => `${k.label} ${formatCents(k.totalCents)}`).join("; ")}.`,
    );
  }

  if (s.dividas.length > 0) {
    l.push("Dívidas em detalhe:");
    for (const d of s.dividas) {
      const partes = [`falta pagar ${formatCents(d.balanceCents)}`];
      if (d.annualRatePct !== null) partes.push(`taxa ${pct(d.annualRatePct)}`);
      if (d.monthlyPaymentCents !== null) partes.push(`prestação ${formatCents(d.monthlyPaymentCents)}`);
      if (d.nextChangeOn && d.nextPaymentCents !== null) {
        partes.push(`em ${d.nextChangeOn} a prestação passa a ${formatCents(d.nextPaymentCents)}`);
      }
      l.push(`- ${d.label}: ${partes.join(", ")}.`);
    }
    l.push(`Juros de dívida por ano, à taxa atual: ${formatCents(s.annualDebtInterestCents)}.`);
  }

  if (s.monthlyIncomeCents !== null) l.push(`Rendimento mensal: ${formatCents(s.monthlyIncomeCents)}.`);
  if (s.monthlyExpenseCents !== null) {
    l.push(`Despesa média mensal: ${formatCents(s.monthlyExpenseCents)}.`);
  }
  if (s.savingsRatePct !== null) l.push(`Taxa de poupança: ${pct(s.savingsRatePct)}.`);
  else l.push("Taxa de poupança: não dá para saber, não há rendimento registado.");

  if (s.categorias.length > 0) {
    l.push(
      `Despesa por categoria, por mês: ${s.categorias
        .map((c) => `${c.label} ${formatCents(c.monthlyCents)}`)
        .join("; ")}.`,
    );
  }

  if (s.anosDeDespesa !== null) {
    // A vírgula troca-se no número e não na frase: num número redondo ("4") não
    // há ponto decimal nenhum, e um `replace` na frase inteira comia o ponto
    // final em vez dele.
    const anos = String(Math.round(s.anosDeDespesa * 10) / 10).replace(".", ",");
    l.push(`O património líquido dá para ${anos} anos da despesa atual.`);
  }

  if (s.investmentCostCents > 0) {
    l.push(
      `Investimentos: ${formatCents(s.investmentCostCents)} investidos${
        s.investmentGainCents !== null
          ? `, com ${s.investmentGainCents >= 0 ? "ganho" : "perda"} de ${formatCents(Math.abs(s.investmentGainCents))}`
          : ""
      }.`,
    );
  }

  if (s.historico) {
    l.push(
      `Evolução de ${s.historico.dePeriodo} a ${s.historico.aPeriodo}: ${
        s.historico.changeCents >= 0 ? "+" : ""
      }${formatCents(s.historico.changeCents)}${
        s.historico.changePct !== null ? ` (${pct(s.historico.changePct)})` : ""
      }.`,
    );
  } else {
    l.push("Ainda não há histórico do património: só existe a fotografia de agora.");
  }

  /**
   * O saldo entre as pessoas do ambiente. Sem isto, um chat sobre "a minha
   * situação" não sabe responder à pergunta mais comum que se faz a esta app.
   */
  if (s.saldos.length > 0) {
    l.push(
      `Saldo entre as pessoas do ambiente: ${s.saldos
        .map(
          (p) =>
            `${p.nome} ${p.netCents === 0 ? "está a zero" : p.netCents > 0 ? `tem a receber ${formatCents(p.netCents)}` : `tem a pagar ${formatCents(-p.netCents)}`}`,
        )
        .join("; ")}.`,
    );
  }
  if (s.acertos.length > 0) {
    l.push(
      `Pagamentos que zerariam tudo: ${s.acertos
        .map((t) => `${t.de} paga ${formatCents(t.cents)} a ${t.para}`)
        .join("; ")}.`,
    );
  }

  if (s.pagina) l.push(`A pessoa está agora na página ${s.pagina} da app.`);

  return l.join("\n");
}
