/**
 * Repositório em memória — app navegável de ponta a ponta sem Supabase.
 *
 * Mantém o estado num singleton de módulo (persiste enquanto o processo viver).
 * Respeita a privacidade das despesas pessoais (REQ-PRIV-2): o viewer só vê as
 * suas pessoais, mais as que o dono tornou visíveis.
 */

import { randomUUID } from "node:crypto";
import { stableUid } from "@/lib/domain";
import type { Expense, Settlement, ClassificationRule, Split } from "@/lib/domain";
import { normalizeText } from "@/lib/domain";
import type {
  AddMemberInput,
  AppUser,
  Category,
  ContactMessage,
  CreateCategoryInput,
  CreateContactInput,
  CreateExpenseInput,
  CreateSettlementInput,
  CreateSpaceInput,
  ExpenseFilters,
  CreateRecurringInput,
  Member,
  RecurringTemplate,
  Repository,
  Space,
  UpdateCategoryInput,
  UpdateMemberInput,
  UpdateRecurringInput,
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
  recurring: RecurringTemplate[];
  appUsers: AppUser[];
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
      recurring: [],
      appUsers: [],
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

  async updateMember(id: string, spaceId: string, patch: UpdateMemberInput): Promise<void> {
    const m = getStore().members.find((x) => x.id === id && x.spaceId === spaceId);
    if (!m) return;
    if (patch.name !== undefined) m.name = patch.name;
    if (patch.email !== undefined) m.email = patch.email;
    if (patch.role !== undefined) m.role = patch.role;
    if (patch.linkedUserId !== undefined) m.linkedUserId = patch.linkedUserId;
  }

  async deleteMember(id: string, spaceId: string): Promise<void> {
    const store = getStore();
    store.members = store.members.filter((m) => !(m.id === id && m.spaceId === spaceId));
  }

  async countMemberActivity(memberId: string): Promise<number> {
    const store = getStore();
    const exp = store.expenses.filter(
      (e) => !e.deletedAt && (e.payerId === memberId || e.ownerId === memberId),
    ).length;
    const set = store.settlements.filter(
      (s) => s.fromUserId === memberId || s.toUserId === memberId,
    ).length;
    return exp + set;
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
      settledAt: null,
      recurringId: input.recurringId ?? null,
      approvalStatus: input.approvalStatus ?? null,
      approverId: input.approverId ?? null,
      submittedBy: input.submittedBy ?? null,
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

  async settleOpenExpenses(spaceId: string): Promise<number> {
    const now = new Date().toISOString();
    let n = 0;
    for (const e of getStore().expenses) {
      if (
        (e.spaceId ?? "casa") === spaceId &&
        e.kind === "shared" &&
        !e.deletedAt &&
        e.status === "confirmed" &&
        !e.settledAt
      ) {
        e.settledAt = now;
        n += 1;
      }
    }
    return n;
  }

  async reopenExpenses(spaceId: string): Promise<void> {
    for (const e of getStore().expenses) {
      if ((e.spaceId ?? "casa") === spaceId) e.settledAt = null;
    }
  }

  async confirmExpense(id: string, amountCents: number): Promise<void> {
    const e = getStore().expenses.find((x) => x.id === id);
    if (e) {
      e.amountCents = amountCents;
      e.status = "confirmed";
      e.updatedAt = new Date().toISOString();
    }
  }

  async listRecurring(spaceId: string): Promise<RecurringTemplate[]> {
    return getStore()
      .recurring.filter((r) => r.spaceId === spaceId)
      .sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
  }

  async getRecurring(id: string, spaceId: string): Promise<RecurringTemplate | null> {
    return getStore().recurring.find((r) => r.id === id && r.spaceId === spaceId) ?? null;
  }

  async createRecurring(input: CreateRecurringInput): Promise<RecurringTemplate> {
    const tpl: RecurringTemplate = {
      id: `rec_${randomUUID()}`,
      spaceId: input.spaceId,
      description: input.description,
      categoryId: input.categoryId ?? null,
      payerId: input.payerId,
      kind: input.kind,
      split: input.split,
      amountCents: input.amountCents ?? null,
      valueType: input.valueType,
      frequency: input.frequency,
      nextDate: input.nextDate,
      endDate: input.endDate ?? null,
      status: "active",
      createdBy: input.createdBy ?? null,
      createdAt: new Date().toISOString(),
    };
    getStore().recurring.push(tpl);
    return tpl;
  }

  async updateRecurring(id: string, spaceId: string, patch: UpdateRecurringInput): Promise<void> {
    const r = getStore().recurring.find((x) => x.id === id && x.spaceId === spaceId);
    if (!r) return;
    if (patch.description !== undefined) r.description = patch.description;
    if (patch.categoryId !== undefined) r.categoryId = patch.categoryId;
    if (patch.payerId !== undefined) r.payerId = patch.payerId;
    if (patch.split !== undefined) r.split = patch.split;
    if (patch.amountCents !== undefined) r.amountCents = patch.amountCents;
    if (patch.valueType !== undefined) r.valueType = patch.valueType;
    if (patch.frequency !== undefined) r.frequency = patch.frequency;
    if (patch.nextDate !== undefined) r.nextDate = patch.nextDate;
    if (patch.endDate !== undefined) r.endDate = patch.endDate;
    if (patch.status !== undefined) r.status = patch.status;
  }

  async deleteRecurring(id: string, spaceId: string): Promise<void> {
    const store = getStore();
    store.recurring = store.recurring.filter((r) => !(r.id === id && r.spaceId === spaceId));
  }

  async recurringExpenseExists(recurringId: string, transactionDate: string): Promise<boolean> {
    return getStore().expenses.some(
      (e) => e.recurringId === recurringId && e.transactionDate === transactionDate && !e.deletedAt,
    );
  }

  async updateExpensesForRecurring(
    recurringId: string,
    patch: { description: string; categoryId: string | null; payerId: string; split: Split },
    amount?: { cents: number; onlyPending: boolean },
  ): Promise<void> {
    const now = new Date().toISOString();
    for (const e of getStore().expenses) {
      if (e.recurringId !== recurringId || e.deletedAt) continue;
      e.description = patch.description;
      e.categoryId = patch.categoryId;
      e.payerId = patch.payerId;
      e.split = patch.split;
      if (amount && (!amount.onlyPending || e.status === "pending")) {
        e.amountCents = amount.cents;
      }
      e.updatedAt = now;
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

  async getAppUserByEmail(email: string): Promise<AppUser | null> {
    const e = email.toLowerCase();
    return getStore().appUsers.find((u) => u.email.toLowerCase() === e) ?? null;
  }

  async createAppUser(input: AppUser): Promise<void> {
    const store = getStore();
    if (!store.appUsers.some((u) => u.id === input.id)) store.appUsers.push({ ...input });
  }

  async deleteAppUser(id: string): Promise<void> {
    const store = getStore();
    store.appUsers = store.appUsers.filter((u) => u.id !== id);
    delete store.passwords[id];
  }

  async setExpenseApproval(id: string, status: "approved" | "rejected"): Promise<void> {
    const e = getStore().expenses.find((x) => x.id === id);
    if (e) {
      e.approvalStatus = status === "approved" ? null : "rejected";
      e.updatedAt = new Date().toISOString();
    }
  }

  async countPendingApprovals(spaceId: string): Promise<number> {
    return getStore().expenses.filter(
      (e) => (e.spaceId ?? "casa") === spaceId && e.approvalStatus === "pending" && !e.deletedAt,
    ).length;
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
