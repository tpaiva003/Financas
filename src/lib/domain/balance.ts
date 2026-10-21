/**
 * Cálculo de saldo (REQ-BAL).
 *
 * Princípio: o saldo é sempre **explicável** até às despesas que o compõem.
 * Por isso devolvemos não só o net por utilizador como a lista de contribuições.
 *
 * Regras:
 *  - Só despesas **partilhadas**, **confirmadas** e **não eliminadas** contam.
 *  - Despesas pendentes (ex.: recorrentes de valor variável por confirmar) NÃO
 *    entram no saldo até serem confirmadas.
 *  - "Quem pagou" é independente da divisão.
 */

import { computeShares } from "./split";
import type { Expense, Settlement, UserId } from "./types";

export interface BalanceContribution {
  source: "expense" | "settlement";
  id: string;
  date: string;
  description: string;
  amountCents: number;
  /** Variação de net aplicada a cada utilizador por este item. */
  deltas: Record<UserId, number>;
}

export interface BalanceResult {
  /** Net por utilizador: positivo = é-lhe devido; negativo = deve. */
  netByUser: Record<UserId, number>;
  contributions: BalanceContribution[];
}

export interface ComputeBalanceParams {
  /** Os utilizadores do agregado (tipicamente 2). */
  users: UserId[];
  expenses: Expense[];
  settlements: Settlement[];
  /**
   * Desde quando cada pessoa divide despesas ("AAAA-MM-DD"). Ausente ou `null`
   * quer dizer "desde sempre", que é o comportamento de quem já cá estava.
   *
   * Sem isto, acrescentar alguém ao ambiente redividia o histórico inteiro: a
   * pessoa passava a dever a sua parte de jantares em que não esteve e o saldo
   * de quem lá estava invertia-se sozinho. O saldo deixava de ser explicável,
   * que é o único invariante que este ficheiro tem de defender.
   */
  participatesFrom?: Record<UserId, string | null>;
}

/**
 * Quem divide ESTA despesa.
 *
 * Só conta para divisões em partes iguais. Uma divisão com pesos explícitos
 * (percentagens, quotas, montantes fixos) já nomeia quem suporta o quê: quem
 * não estiver lá tem peso zero e não recebe nada, por isso acrescentar uma
 * pessoa nunca lhe mexeu. É o `EQUAL` que reparte por cabeças, e é só aí que
 * "quantas cabeças" muda o resultado.
 */
function participantsFor(
  e: Expense,
  users: UserId[],
  participatesFrom: Record<UserId, string | null> | undefined,
): UserId[] {
  if (e.split.type !== "EQUAL" || !participatesFrom) return users;

  const elegiveis = users.filter((u) => {
    const desde = participatesFrom[u] ?? null;
    return desde === null || e.transactionDate >= desde;
  });

  // Se ninguém for elegível, a despesa não pode ser repartida por cabeças. Em
  // vez de rebentar (ou de a repartir por gente que não participou), fica a
  // cargo de quem a pagou: o efeito no saldo é zero e ninguém fica com uma
  // dívida inventada.
  return elegiveis.length > 0 ? elegiveis : [e.payerId];
}

/** Uma despesa entra no saldo? */
export function countsTowardsBalance(e: Expense): boolean {
  const approved = e.approvalStatus !== "pending" && e.approvalStatus !== "rejected";
  return e.kind === "shared" && e.status === "confirmed" && !e.deletedAt && approved;
}

export function computeBalance(params: ComputeBalanceParams): BalanceResult {
  const { users, expenses, settlements, participatesFrom } = params;

  /**
   * As chaves do saldo.
   *
   * Inclui quem pagou mesmo que não conste nos membros. Antes não incluía, e o
   * crédito de quem tinha pago era simplesmente descartado enquanto as quotas
   * continuavam a ser debitadas — o saldo deixava de somar zero e as duas
   * pessoas apareciam a dever dinheiro a ninguém.
   */
  const chaves = new Set<UserId>(users);
  for (const e of expenses) if (countsTowardsBalance(e)) chaves.add(e.payerId);
  for (const s of settlements) {
    chaves.add(s.fromUserId);
    chaves.add(s.toUserId);
  }

  const net: Record<UserId, number> = {};
  for (const u of chaves) net[u] = 0;

  const contributions: BalanceContribution[] = [];

  for (const e of expenses) {
    if (!countsTowardsBalance(e)) continue;
    const shares = computeShares(
      e.amountCents,
      e.split,
      participantsFor(e, users, participatesFrom),
    );

    const deltas: Record<UserId, number> = {};
    for (const u of chaves) deltas[u] = 0;

    // Quem pagou colocou o montante total. É independente de como se divide.
    deltas[e.payerId] = (deltas[e.payerId] ?? 0) + e.amountCents;
    // Cada um consome a sua quota-parte.
    for (const u of chaves) deltas[u] = (deltas[u] ?? 0) - (shares[u] ?? 0);

    for (const u of chaves) net[u] = (net[u] ?? 0) + (deltas[u] ?? 0);

    contributions.push({
      source: "expense",
      id: e.id,
      date: e.transactionDate,
      description: e.description,
      amountCents: e.amountCents,
      deltas,
    });
  }

  for (const s of settlements) {
    const deltas: Record<UserId, number> = {};
    for (const u of chaves) deltas[u] = 0;
    // Quem paga o acerto reduz a sua dívida; quem recebe reduz o seu crédito.
    deltas[s.fromUserId] = (deltas[s.fromUserId] ?? 0) + s.amountCents;
    deltas[s.toUserId] = (deltas[s.toUserId] ?? 0) - s.amountCents;

    for (const u of chaves) net[u] = (net[u] ?? 0) + (deltas[u] ?? 0);

    contributions.push({
      source: "settlement",
      id: s.id,
      date: s.date,
      description: s.note ?? "Acerto",
      amountCents: s.amountCents,
      deltas,
    });
  }

  return { netByUser: net, contributions };
}

export interface Transfer {
  fromUserId: UserId;
  toUserId: UserId;
  amountCents: number;
}

/**
 * Simplificação de dívidas (REQ-BAL, multi-pessoa): a partir do net por
 * utilizador, devolve a lista mínima (greedy) de pagamentos que zera o saldo.
 * Ex.: net {A:+10, B:-30, C:+20} → C? Aqui A e C são credores, B paga.
 *
 * Algoritmo: emparelha o maior devedor com o maior credor, repetidamente.
 * Não é teoricamente ótimo no nº de transferências, mas é o padrão usado e dá
 * sempre um plano correto (a soma das transferências reconcilia os nets).
 */
export function simplifyDebts(netByUser: Record<UserId, number>): Transfer[] {
  const debtors: { id: UserId; amount: number }[] = [];
  const creditors: { id: UserId; amount: number }[] = [];
  for (const [id, net] of Object.entries(netByUser)) {
    if (net < 0) debtors.push({ id, amount: -net });
    else if (net > 0) creditors.push({ id, amount: net });
  }
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!;
    const c = creditors[j]!;
    const pay = Math.min(d.amount, c.amount);
    if (pay > 0) {
      transfers.push({ fromUserId: d.id, toUserId: c.id, amountCents: pay });
    }
    d.amount -= pay;
    c.amount -= pay;
    if (d.amount === 0) i += 1;
    if (c.amount === 0) j += 1;
  }
  return transfers;
}
