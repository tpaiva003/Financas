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
}

/** Uma despesa entra no saldo? */
export function countsTowardsBalance(e: Expense): boolean {
  return e.kind === "shared" && e.status === "confirmed" && !e.deletedAt;
}

export function computeBalance(params: ComputeBalanceParams): BalanceResult {
  const { users, expenses, settlements } = params;
  const net: Record<UserId, number> = {};
  for (const u of users) net[u] = 0;

  const contributions: BalanceContribution[] = [];

  for (const e of expenses) {
    if (!countsTowardsBalance(e)) continue;
    const shares = computeShares(e.amountCents, e.split, users);

    const deltas: Record<UserId, number> = {};
    for (const u of users) deltas[u] = 0;

    // Quem pagou colocou o montante total.
    deltas[e.payerId] = (deltas[e.payerId] ?? 0) + e.amountCents;
    // Cada um consome a sua quota-parte.
    for (const u of users) deltas[u] = (deltas[u] ?? 0) - (shares[u] ?? 0);

    for (const u of users) net[u] = (net[u] ?? 0) + (deltas[u] ?? 0);

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
    for (const u of users) deltas[u] = 0;
    // Quem paga o acerto reduz a sua dívida; quem recebe reduz o seu crédito.
    deltas[s.fromUserId] = (deltas[s.fromUserId] ?? 0) + s.amountCents;
    deltas[s.toUserId] = (deltas[s.toUserId] ?? 0) - s.amountCents;

    for (const u of users) net[u] = (net[u] ?? 0) + (deltas[u] ?? 0);

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

export interface PairwiseStatement {
  settled: boolean;
  /** Quem deve (só presente se não estiver saldado). */
  debtorId?: UserId;
  /** A quem deve. */
  creditorId?: UserId;
  /** Quanto o devedor deve ao credor (absoluto, cêntimos). */
  amountCents: number;
}

/**
 * Traduz os nets de dois utilizadores numa frase "quem deve a quem e quanto".
 */
export function pairwiseStatement(
  netByUser: Record<UserId, number>,
  userA: UserId,
  userB: UserId,
): PairwiseStatement {
  const a = netByUser[userA] ?? 0;
  if (a === 0) {
    return { settled: true, amountCents: 0 };
  }
  if (a > 0) {
    // A está em crédito → B deve a A.
    return { settled: false, debtorId: userB, creditorId: userA, amountCents: a };
  }
  // A está em dívida → A deve a B.
  return { settled: false, debtorId: userA, creditorId: userB, amountCents: -a };
}
