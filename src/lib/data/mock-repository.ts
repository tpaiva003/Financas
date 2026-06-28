/**
 * Repositório em memória — app navegável de ponta a ponta sem Supabase.
 *
 * Mantém o estado num singleton de módulo (persiste enquanto o processo viver).
 * Respeita a privacidade das despesas pessoais (REQ-PRIV-2): o viewer só vê as
 * suas pessoais, mais as que o dono tornou visíveis.
 */

import { randomUUID } from "node:crypto";
import { stableUid } from "@/lib/domain";
import type { Expense, Settlement, ClassificationRule } from "@/lib/domain";
import { normalizeText } from "@/lib/domain";
import type {
  Category,
  CreateExpenseInput,
  CreateSettlementInput,
  ExpenseFilters,
  Repository,
} from "./repository";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_RULES,
  seedExpenses,
  seedSettlements,
} from "./seed-data";

interface Store {
  expenses: Expense[];
  settlements: Settlement[];
  categories: Category[];
  rules: ClassificationRule[];
}

// Singleton persistente entre pedidos no mesmo processo (dev).
const globalForStore = globalThis as unknown as { __financasStore?: Store };

function getStore(): Store {
  if (!globalForStore.__financasStore) {
    globalForStore.__financasStore = {
      expenses: seedExpenses(),
      settlements: seedSettlements(),
      categories: DEFAULT_CATEGORIES,
      rules: DEFAULT_RULES,
    };
  }
  return globalForStore.__financasStore;
}

/** Pode o viewer ver esta despesa? (privacidade das pessoais) */
function canView(e: Expense, viewerId: string): boolean {
  if (e.kind === "shared") return true;
  if (e.ownerId === viewerId) return true;
  return e.visibleToPartner === true;
}

export class MockRepository implements Repository {
  async listExpenses(filters: ExpenseFilters): Promise<Expense[]> {
    const store = getStore();
    return store.expenses
      .filter((e) => filters.includeDeleted || !e.deletedAt)
      .filter((e) => canView(e, filters.viewerId))
      .filter((e) => (filters.from ? e.transactionDate >= filters.from : true))
      .filter((e) => (filters.to ? e.transactionDate <= filters.to : true))
      .filter((e) => (filters.categoryId ? e.categoryId === filters.categoryId : true))
      .filter((e) => (filters.payerId ? e.payerId === filters.payerId : true))
      .filter((e) => (filters.kind ? e.kind === filters.kind : true))
      .filter((e) =>
        filters.query ? normalizeText(e.description).includes(normalizeText(filters.query)) : true,
      )
      .sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : -1));
  }

  async getExpense(id: string, viewerId: string): Promise<Expense | null> {
    const e = getStore().expenses.find((x) => x.id === id);
    if (!e || !canView(e, viewerId)) return null;
    return e;
  }

  async createExpense(input: CreateExpenseInput): Promise<Expense> {
    const now = new Date().toISOString();
    const uid = stableUid({
      source: input.origin,
      description: input.description,
      amountCents: input.amountCents,
      currency: input.currency,
      transactionDate: input.transactionDate,
      account: null,
    });
    const expense: Expense = {
      id: randomUUID(),
      uid,
      description: input.description,
      amountCents: input.amountCents,
      currency: input.currency,
      transactionDate: input.transactionDate,
      postedDate: input.postedDate ?? null,
      categoryId: input.categoryId ?? null,
      payerId: input.payerId,
      kind: input.kind,
      split: input.split,
      origin: input.origin,
      status: input.status ?? "confirmed",
      ownerId: input.ownerId,
      visibleToPartner: input.visibleToPartner ?? false,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    getStore().expenses.unshift(expense);
    return expense;
  }

  async softDeleteExpense(id: string, _actorId: string): Promise<void> {
    const e = getStore().expenses.find((x) => x.id === id);
    if (e) {
      e.deletedAt = new Date().toISOString();
      e.updatedAt = e.deletedAt;
    }
  }

  async listSettlements(): Promise<Settlement[]> {
    return [...getStore().settlements].sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  async createSettlement(input: CreateSettlementInput): Promise<Settlement> {
    const settlement: Settlement = {
      id: randomUUID(),
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      amountCents: input.amountCents,
      currency: input.currency,
      date: input.date,
      note: input.note ?? null,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    getStore().settlements.unshift(settlement);
    return settlement;
  }

  async listCategories(): Promise<Category[]> {
    return getStore().categories;
  }

  async listClassificationRules(): Promise<ClassificationRule[]> {
    return getStore().rules;
  }
}
