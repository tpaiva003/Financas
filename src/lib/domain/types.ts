/**
 * Tipos do domínio — App de Despesas Partilhadas.
 *
 * Invariantes (ver CLAUDE.md / REQUISITOS.md):
 *  - "Quem pagou" (payer) é independente de "como se divide" (split).
 *  - Deduplicação por UID estável: a mesma transação nunca entra duas vezes.
 *  - Entradas manuais nunca são reclassificadas automaticamente.
 *  - O saldo tem de ser sempre explicável até às despesas que o compõem.
 *
 * Convenção monetária: todos os valores em **cêntimos inteiros** (evita erros
 * de vírgula flutuante). Valores negativos são válidos (reembolsos/estornos).
 */

export type UserId = string;

export type Currency = "EUR" | "USD" | "GBP";

/** Como uma despesa é dividida entre os utilizadores. */
export type SplitType = "EQUAL" | "PERCENT" | "FIXED" | "SHARES";

export interface Split {
  type: SplitType;
  /**
   * Pesos por utilizador, conforme o tipo:
   *  - EQUAL:   ignorado (divide em partes iguais entre os participantes).
   *  - PERCENT: percentagem por utilizador (devem somar 100).
   *  - SHARES:  número de quotas por utilizador (proporcional).
   *  - FIXED:   montante fixo em cêntimos por utilizador (deve somar o total).
   */
  weights?: Record<UserId, number>;
}

export type ExpenseKind = "shared" | "personal";

export type ExpenseOrigin = "manual" | "import" | "recurring";

export type ExpenseStatus = "confirmed" | "pending";

/**
 * Linha de despesa (item) — opcional, para dividir uma compra única em parte
 * partilhada e parte pessoal (REQ-SPL-3).
 */
export interface ExpenseItem {
  id: string;
  description: string;
  amountCents: number;
  kind: ExpenseKind;
}

export interface Expense {
  id: string;
  /** UID estável para deduplicação. */
  uid: string;
  description: string;
  amountCents: number;
  currency: Currency;
  /** Data da transação (ISO YYYY-MM-DD). */
  transactionDate: string;
  /** Data de lançamento (cartões) — opcional. */
  postedDate?: string | null;
  categoryId?: string | null;
  tags?: string[];
  /** Quem pagou. */
  payerId: UserId;
  kind: ExpenseKind;
  split: Split;
  origin: ExpenseOrigin;
  status: ExpenseStatus;
  /** Itens opcionais (split ao nível do item). */
  items?: ExpenseItem[];
  receiptPath?: string | null;
  /** Dono (para despesas pessoais) — quem a registou. */
  ownerId: UserId;
  /** Visível ao outro utilizador? (despesas pessoais, REQ-PRIV-2). */
  visibleToPartner?: boolean;
  createdBy: UserId;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Settlement {
  id: string;
  /** Quem paga. */
  fromUserId: UserId;
  /** Quem recebe. */
  toUserId: UserId;
  amountCents: number;
  currency: Currency;
  date: string;
  note?: string | null;
  createdBy: UserId;
  createdAt: string;
}

/** Regra de classificação: palavra-chave → categoria e/ou partilhada/pessoal. */
export interface ClassificationRule {
  id: string;
  /** Texto a procurar na descrição (case-insensitive, sem acentos). */
  keyword: string;
  categoryId?: string | null;
  kind?: ExpenseKind | null;
  /** Ordem de avaliação (menor = avaliado primeiro). */
  priority: number;
  enabled: boolean;
}

export interface ClassificationResult {
  categoryId?: string | null;
  kind?: ExpenseKind | null;
  matchedRuleId?: string | null;
}

/** Transação normalizada vinda de um parser/import. */
export interface NormalizedTransaction {
  source: string;
  description: string;
  amountCents: number;
  currency: Currency;
  transactionDate: string;
  postedDate?: string | null;
  /** Conta/cartão de origem (ajuda a desambiguar UIDs) — opcional. */
  account?: string | null;
}
