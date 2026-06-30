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
  AddMemberInput,
  Category,
  ContactMessage,
  CreateCategoryInput,
  CreateContactInput,
  CreateExpenseInput,
  CreateSettlementInput,
  CreateSpaceInput,
  ExpenseFilters,
  Member,
  Repository,
  Space,
  UpdateCategoryInput,
} from "./repository";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_RULES,
  seedExpenses,
  seedSettlements,
  seedSpaces,
  seedMembers,
} from "./seed-data";

interface Store {
  spaces: Space[];
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
  categories: Category[];
  rules: ClassificationRule[];
  passwords: Record<string, string>;
  contacts: ContactMessage[];
}

// Singleton persistente entre pedidos no mesmo processo (dev).
const globalForStore = globalThis as unknown as { __financasStore?: Store };

function getStore(): Store {
  if (!globalForStore.__financasStore) {
    globalForStore.__financasStore = {
      spaces: seedSpaces(),
      members: seedMembers(),
      expenses: seedExpenses(),
      settlements: seedSettlements(),
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, spaceId: null })),
      rules: DEFAULT_RULES,
      passwords: {},
      contacts: [],
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
  async listSpacesForUser(userId: string): Promise<Space[]> {
    const store = getStore();
    const spaceIds = new Set(
      store.members.filter((m) => m.linkedUserId === userId).map((m) => m.spaceId),
    );
    return store.spaces.filter((s) => spaceIds.has(s.id));
  }

  async getSpace(spaceId: string): Promise<Space | null> {
    return getStore().spaces.find((s) => s.id === spaceId) ?? null;
  }

  async createSpace(input: CreateSpaceInput): Promise<Space> {
    const store = getStore();
    const space: Space = {
      id: randomUUID(),
      name: input.name,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    store.spaces.unshift(space);
    for (const m of input.members) {
      store.members.push({
        id: randomUUID(),
        spaceId: space.id,
        name: m.name,
        linkedUserId: m.linkedUserId ?? null,
        email: m.email ?? null,
      });
    }
    return space;
  }

  async listMembers(spaceId: string): Promise<Member[]> {
    return getStore().members.filter((m) => m.spaceId === spaceId);
  }

  async addMember(input: AddMemberInput): Promise<Member> {
    const member: Member = {
      id: randomUUID(),
      spaceId: input.spaceId,
      name: input.name,
      linkedUserId: input.linkedUserId ?? null,
      email: input.email ?? null,
    };
    getStore().members.push(member);
    return member;
  }

  async listExpenses(filters: ExpenseFilters): Promise<Expense[]> {
    const store = getStore();
    return store.expenses
      .filter((e) => (e.spaceId ?? "casa") === filters.spaceId)
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
      spaceId: input.spaceId,
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

  async updateExpense(id: string, input: import("./repository").UpdateExpenseInput): Promise<void> {
    const e = getStore().expenses.find((x) => x.id === id);
    if (!e) return;
    e.description = input.description;
    e.amountCents = input.amountCents;
    e.transactionDate = input.transactionDate;
    e.categoryId = input.categoryId ?? null;
    e.payerId = input.payerId;
    e.kind = input.kind;
    e.split = input.split;
    e.ownerId = input.ownerId;
    e.visibleToPartner = input.visibleToPartner ?? false;
    e.updatedAt = new Date().toISOString();
  }

  async setReceiptPath(id: string, path: string | null): Promise<void> {
    const e = getStore().expenses.find((x) => x.id === id);
    if (e) e.receiptPath = path;
  }

  async softDeleteExpense(id: string, _actorId: string): Promise<void> {
    const e = getStore().expenses.find((x) => x.id === id);
    if (e) {
      e.deletedAt = new Date().toISOString();
      e.updatedAt = e.deletedAt;
    }
  }

  async listSettlements(spaceId: string): Promise<Settlement[]> {
    return getStore()
      .settlements.filter((s) => (s.spaceId ?? "casa") === spaceId)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  async createSettlement(input: CreateSettlementInput): Promise<Settlement> {
    const settlement: Settlement = {
      id: randomUUID(),
      spaceId: input.spaceId,
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

  async listCategories(spaceId?: string): Promise<Category[]> {
    return getStore()
      .categories.filter((c) => !c.spaceId || (spaceId && c.spaceId === spaceId))
      .sort((a, b) => a.name.localeCompare(b.name, "pt"));
  }

  async createCategory(input: CreateCategoryInput): Promise<Category> {
    const cat: Category = {
      id: `cat_${randomUUID()}`,
      name: input.name,
      color: input.color,
      icon: input.icon ?? undefined,
      spaceId: input.spaceId,
    };
    getStore().categories.push(cat);
    return cat;
  }

  async updateCategory(id: string, spaceId: string, patch: UpdateCategoryInput): Promise<void> {
    const c = getStore().categories.find((x) => x.id === id && x.spaceId === spaceId);
    if (!c) return; // padrão (sem space) não é editável
    if (patch.name !== undefined) c.name = patch.name;
    if (patch.color !== undefined) c.color = patch.color;
    if (patch.icon !== undefined) c.icon = patch.icon ?? undefined;
  }

  async deleteCategory(id: string, spaceId: string): Promise<void> {
    const store = getStore();
    store.categories = store.categories.filter((c) => !(c.id === id && c.spaceId === spaceId));
    // Despesas que apontavam para esta categoria ficam sem categoria.
    for (const e of store.expenses) {
      if (e.categoryId === id) e.categoryId = null;
    }
  }

  async listClassificationRules(): Promise<ClassificationRule[]> {
    return getStore().rules;
  }

  async getUserPasswordHash(userId: string): Promise<string | null> {
    return getStore().passwords[userId] ?? null;
  }

  async setUserPasswordHash(userId: string, hash: string): Promise<void> {
    getStore().passwords[userId] = hash;
  }

  async createContactMessage(input: CreateContactInput): Promise<void> {
    getStore().contacts.unshift({
      id: randomUUID(),
      name: input.name ?? null,
      email: input.email,
      message: input.message,
      createdAt: new Date().toISOString(),
      readAt: null,
      archivedAt: null,
      notes: null,
    });
  }

  async listContactMessages(): Promise<ContactMessage[]> {
    return [...getStore().contacts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async markContactMessageRead(id: string): Promise<void> {
    const m = getStore().contacts.find((c) => c.id === id);
    if (m) m.readAt = new Date().toISOString();
  }

  async setContactMessageArchived(id: string, archived: boolean): Promise<void> {
    const m = getStore().contacts.find((c) => c.id === id);
    if (m) {
      m.archivedAt = archived ? new Date().toISOString() : null;
      if (archived && !m.readAt) m.readAt = new Date().toISOString();
    }
  }

  async setContactMessageNotes(id: string, notes: string | null): Promise<void> {
    const m = getStore().contacts.find((c) => c.id === id);
    if (m) m.notes = notes;
  }

  async countUnreadContactMessages(): Promise<number> {
    return getStore().contacts.filter((c) => !c.readAt && !c.archivedAt).length;
  }
}
