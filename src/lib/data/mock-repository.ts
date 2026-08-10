/**
 * Repositório em memória, app navegável de ponta a ponta sem Supabase.
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
  CreateImportBatchInput,
  ImportBatch,
  ImportTemplate,
  ImportReminder,
  SpendingGoal,
  Asset,
  AssetTrade,
  StoredQuote,
  CreateAssetInput,
  CreateAssetTradeInput,
  CreateNetWorthSnapshot,
  NetWorthSnapshotRow,
  Income,
  CreateIncomeInput,
  Membership,
  PlatformStats,
  ReminderFrequency,
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
  importBatches: ImportBatch[];
  importTemplates: ImportTemplate[];
  importReminders: ImportReminder[];
  spendingGoals: SpendingGoal[];
  assets: Asset[];
  assetTrades: AssetTrade[];
  netWorthSnapshots: NetWorthSnapshotRow[];
  quotes: Record<string, StoredQuote[]>;
  quoteCurrencies: Record<string, string>;
  income: Income[];
  resetTokens: { userId: string; tokenHash: string; expiresAt: string; usedAt?: string }[];
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
      importBatches: [],
      importTemplates: [],
      importReminders: [],
      spendingGoals: [],
      assets: [],
      assetTrades: [],
      netWorthSnapshots: [],
      quotes: {},
      quoteCurrencies: {},
      income: [],
      resetTokens: [],
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

/**
 * Uma despesa pelo id, mas só se for mesmo daquele ambiente.
 *
 * Procurar só pelo id deixava qualquer id chegar a qualquer ambiente. O mock
 * aplica a mesma regra que o Supabase para não haver um backend mais permissivo
 * do que o outro: se os testes correm contra o mock, é o mock que tem de
 * apanhar o engano.
 */
function findExpense(id: string, spaceId: string): Expense | undefined {
  return getStore().expenses.find((x) => x.id === id && (x.spaceId ?? "casa") === spaceId);
}

export class MockRepository implements Repository {
  async listSpacesForUser(userId: string): Promise<Space[]> {
    const store = getStore();
    const spaceIds = new Set(
      store.members.filter((m) => m.linkedUserId === userId).map((m) => m.spaceId),
    );
    return store.spaces
      .filter((s) => spaceIds.has(s.id))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }

  async getSpace(spaceId: string): Promise<Space | null> {
    return getStore().spaces.find((s) => s.id === spaceId) ?? null;
  }

  async countInSpace(
    spaceId: string,
    what: "expenses" | "assets" | "members",
  ): Promise<number> {
    const store = getStore();
    if (what === "expenses") {
      return store.expenses.filter((e) => e.spaceId === spaceId && !e.deletedAt).length;
    }
    if (what === "assets") return store.assets.filter((a) => a.spaceId === spaceId).length;
    return store.members.filter((m) => m.spaceId === spaceId).length;
  }

  async createSpace(input: CreateSpaceInput): Promise<Space> {
    const store = getStore();
    const space: Space = {
      id: randomUUID(),
      name: input.name,
      plan: input.plan ?? "free",
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
      participatesFrom: input.participatesFrom ?? null,
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
    if (patch.participatesFrom !== undefined) m.participatesFrom = patch.participatesFrom;
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

  async getExpense(id: string, spaceId: string, viewerId: string): Promise<Expense | null> {
    const e = findExpense(id, spaceId);
    if (!e || !canView(e, viewerId)) return null;
    return e;
  }

  async createExpense(input: CreateExpenseInput): Promise<Expense> {
    const now = new Date().toISOString();
    // O import passa o UID calculado a partir da transação do extrato; nos
    // restantes casos derivamos dos campos da despesa.
    const uid =
      input.uid ??
      stableUid({
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
      importBatchId: input.importBatchId ?? null,
      approvalStatus: input.approvalStatus ?? null,
      approverId: input.approverId ?? null,
      submittedBy: input.submittedBy ?? null,
    };
    getStore().expenses.unshift(expense);
    return expense;
  }

  async updateExpense(
    id: string,
    spaceId: string,
    input: import("./repository").UpdateExpenseInput,
  ): Promise<void> {
    const e = findExpense(id, spaceId);
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

  async setReceiptPath(id: string, spaceId: string, path: string | null): Promise<void> {
    const e = findExpense(id, spaceId);
    if (e) e.receiptPath = path;
  }

  async softDeleteExpense(id: string, spaceId: string, _actorId: string): Promise<void> {
    const e = findExpense(id, spaceId);
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

  async confirmExpense(id: string, spaceId: string, amountCents: number): Promise<void> {
    const e = findExpense(id, spaceId);
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

  async setExpenseApproval(
    id: string,
    spaceId: string,
    status: "approved" | "rejected",
  ): Promise<void> {
    const e = findExpense(id, spaceId);
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

  async reorderSpaces(spaceIds: string[]): Promise<void> {
    const store = getStore();
    spaceIds.forEach((id, i) => {
      const s = store.spaces.find((x) => x.id === id);
      if (s) s.position = i;
    });
  }

  async renameSpace(spaceId: string, name: string): Promise<void> {
    const s = getStore().spaces.find((x) => x.id === spaceId);
    if (s) s.name = name;
  }

  async listAppUsers(): Promise<AppUser[]> {
    return [...getStore().appUsers];
  }

  async findImportTemplate(fingerprint: string): Promise<ImportTemplate | null> {
    return getStore().importTemplates.find((t) => t.fingerprint === fingerprint) ?? null;
  }

  async saveImportTemplate(
    input: Omit<ImportTemplate, "id" | "uses" | "createdAt">,
  ): Promise<void> {
    const store = getStore();
    const existing = store.importTemplates.find((t) => t.fingerprint === input.fingerprint);
    if (existing) {
      existing.uses += 1;
      existing.label = input.label;
      existing.mapping = input.mapping;
      return;
    }
    store.importTemplates.push({
      ...input,
      id: `tpl_${randomUUID()}`,
      uses: 1,
      createdAt: new Date().toISOString(),
    });
  }

  async listImportTemplates(): Promise<ImportTemplate[]> {
    return [...getStore().importTemplates].sort((a, b) => b.uses - a.uses);
  }

  async listImportReminders(spaceId: string): Promise<ImportReminder[]> {
    return getStore().importReminders.filter((r) => r.spaceId === spaceId);
  }

  async upsertImportReminder(input: {
    spaceId: string;
    source: string;
    label?: string | null;
    frequency: ReminderFrequency;
    active: boolean;
  }): Promise<void> {
    const store = getStore();
    const cur = store.importReminders.find(
      (r) => r.spaceId === input.spaceId && r.source === input.source,
    );
    if (cur) {
      cur.frequency = input.frequency;
      cur.active = input.active;
      cur.label = input.label ?? cur.label;
      return;
    }
    store.importReminders.push({
      id: `rem_${randomUUID()}`,
      spaceId: input.spaceId,
      source: input.source,
      label: input.label ?? null,
      frequency: input.frequency,
      active: input.active,
      createdAt: new Date().toISOString(),
    });
  }

  async deleteImportReminder(spaceId: string, source: string): Promise<void> {
    const store = getStore();
    store.importReminders = store.importReminders.filter(
      (r) => !(r.spaceId === spaceId && r.source === source),
    );
  }

  async listMembershipsInSpaces(spaceIds: string[]): Promise<Membership[]> {
    const ids = new Set(spaceIds);
    return getStore()
      .members.filter((m) => ids.has(m.spaceId))
      .map((m) => ({ spaceId: m.spaceId, linkedUserId: m.linkedUserId ?? null }));
  }

  async getPlatformStats(): Promise<PlatformStats> {
    const featuresOf = (spaceId: string): string[] => {
      const st = getStore();
      const usa: [string, { spaceId: string }[]][] = [
        ["patrimonio", st.assets],
        ["investimentos", st.assetTrades],
        ["rendimentos", st.income],
        ["recorrentes", st.recurring],
        ["importacoes", st.importBatches],
        ["metas", st.spendingGoals],
      ];
      return usa.filter(([, rows]) => rows.some((r) => r.spaceId === spaceId)).map(([id]) => id);
    };

    const store = getStore();
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const spaces = store.spaces.map((s) => {
      const expenses = store.expenses.filter((e) => e.spaceId === s.id && !e.deletedAt);
      const lastActivity = expenses.reduce<string | null>(
        (max, e) => (max === null || e.transactionDate > max ? e.transactionDate : max),
        null,
      );
      return {
        id: s.id,
        name: s.name,
        memberCount: store.members.filter((m) => m.spaceId === s.id).length,
        expenseCount: expenses.length,
        lastActivity,
        createdAt: s.createdAt,
        features: featuresOf(s.id),
      };
    });

    // Uso por funcionalidade, só por ambiente: nunca conteúdo.
    const porFuncionalidade = [
      { id: "patrimonio", label: "Património", rows: store.assets },
      { id: "investimentos", label: "Movimentos de investimentos", rows: store.assetTrades },
      { id: "rendimentos", label: "Rendimentos", rows: store.income },
      { id: "recorrentes", label: "Recorrentes", rows: store.recurring },
      { id: "importacoes", label: "Importações", rows: store.importBatches },
      { id: "metas", label: "Metas de despesa", rows: store.spendingGoals },
    ];

    return {
      accountCount: store.appUsers.length,
      spaceCount: spaces.length,
      expenseCount: store.expenses.filter((e) => !e.deletedAt).length,
      activeSpaces: spaces.filter((s) => s.lastActivity !== null && s.lastActivity >= cutoff).length,
      spaces: spaces.sort((a, b) => ((a.lastActivity ?? "") < (b.lastActivity ?? "") ? 1 : -1)),
      templates: store.importTemplates.map((t) => ({ label: t.label, uses: t.uses })),
      features: porFuncionalidade.map((f) => ({
        id: f.id,
        label: f.label,
        spaces: new Set(f.rows.map((r: { spaceId: string }) => r.spaceId)).size,
        records: f.rows.length,
      })),
      warnings: [],
    };
  }

  async listSpendingGoals(spaceId: string): Promise<SpendingGoal[]> {
    return getStore().spendingGoals.filter((g) => g.spaceId === spaceId);
  }

  async upsertSpendingGoal(input: {
    spaceId: string;
    categoryId: string | null;
    amountCents: number;
  }): Promise<void> {
    const store = getStore();
    const cur = store.spendingGoals.find(
      (g) => g.spaceId === input.spaceId && g.categoryId === input.categoryId,
    );
    if (cur) {
      cur.amountCents = input.amountCents;
      return;
    }
    store.spendingGoals.push({
      id: `goal_${randomUUID()}`,
      spaceId: input.spaceId,
      categoryId: input.categoryId,
      amountCents: input.amountCents,
      createdAt: new Date().toISOString(),
    });
  }

  async deleteSpendingGoal(spaceId: string, categoryId: string | null): Promise<void> {
    const store = getStore();
    store.spendingGoals = store.spendingGoals.filter(
      (g) => !(g.spaceId === spaceId && g.categoryId === categoryId),
    );
  }

  async listAssets(spaceId: string): Promise<Asset[]> {
    return getStore().assets.filter((a) => a.spaceId === spaceId);
  }

  async listNetWorthSnapshots(spaceId: string): Promise<NetWorthSnapshotRow[]> {
    return getStore()
      .netWorthSnapshots.filter((s) => s.spaceId === spaceId)
      .sort((a, b) => (a.onDate < b.onDate ? -1 : a.onDate > b.onDate ? 1 : 0));
  }

  async saveNetWorthSnapshot(input: CreateNetWorthSnapshot): Promise<void> {
    const store = getStore();
    // Uma por dia e por ambiente: a do dia substitui a anterior.
    const i = store.netWorthSnapshots.findIndex(
      (s) => s.spaceId === input.spaceId && s.onDate === input.onDate,
    );
    const row: NetWorthSnapshotRow = { id: i >= 0 ? store.netWorthSnapshots[i]!.id : randomUUID(), ...input };
    if (i >= 0) store.netWorthSnapshots[i] = row;
    else store.netWorthSnapshots.push(row);
  }

  async createAsset(input: CreateAssetInput): Promise<Asset> {
    const asset: Asset = {
      ...input,
      id: `ast_${randomUUID()}`,
      updatedAt: new Date().toISOString(),
    };
    getStore().assets.push(asset);
    return asset;
  }

  async updateAsset(id: string, spaceId: string, patch: Partial<CreateAssetInput>): Promise<void> {
    const a = getStore().assets.find((x) => x.id === id && x.spaceId === spaceId);
    if (!a) return;
    Object.assign(a, patch, { updatedAt: new Date().toISOString() });
  }

  async deleteAsset(id: string, spaceId: string): Promise<void> {
    const store = getStore();
    store.assets = store.assets.filter((a) => !(a.id === id && a.spaceId === spaceId));
  }

  async listAssetTrades(spaceId: string, assetId?: string): Promise<AssetTrade[]> {
    return getStore()
      .assetTrades.filter((t) => t.spaceId === spaceId && (!assetId || t.assetId === assetId))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  async createAssetTrade(input: CreateAssetTradeInput): Promise<AssetTrade> {
    const trade: AssetTrade = {
      ...input,
      id: `atr_${randomUUID()}`,
      createdAt: new Date().toISOString(),
    };
    getStore().assetTrades.push(trade);
    return trade;
  }

  async deleteAssetTrade(id: string, spaceId: string): Promise<void> {
    const store = getStore();
    store.assetTrades = store.assetTrades.filter((t) => !(t.id === id && t.spaceId === spaceId));
  }

  async updateAssetTrade(
    id: string,
    spaceId: string,
    patch: Partial<CreateAssetTradeInput>,
  ): Promise<void> {
    const store = getStore();
    const i = store.assetTrades.findIndex((t) => t.id === id && t.spaceId === spaceId);
    if (i < 0) return;
    store.assetTrades[i] = { ...store.assetTrades[i]!, ...patch };
  }

  async listQuotes(symbol: string, fromDate?: string): Promise<StoredQuote[]> {
    const all = getStore().quotes[symbol] ?? [];
    return all
      .filter((q) => !fromDate || q.date >= fromDate)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  async latestQuote(symbol: string): Promise<StoredQuote | null> {
    const all = await this.listQuotes(symbol);
    return all.length > 0 ? all[all.length - 1]! : null;
  }

  async quoteCurrency(symbol: string): Promise<string | null> {
    return getStore().quoteCurrencies[symbol] ?? null;
  }

  async saveQuotes(symbol: string, quotes: StoredQuote[], currency: string): Promise<void> {
    const store = getStore();
    store.quoteCurrencies[symbol] = currency;
    const byDate = new Map((store.quotes[symbol] ?? []).map((q) => [q.date, q]));
    for (const q of quotes) byDate.set(q.date, q);
    store.quotes[symbol] = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  async listAllAssetSymbols(): Promise<string[]> {
    return [...new Set(getStore().assets.map((a) => a.symbol).filter((s): s is string => Boolean(s)))];
  }

  async latestQuoteDate(symbol: string): Promise<string | null> {
    const all = getStore().quotes[symbol] ?? [];
    return all.length === 0 ? null : all.reduce((a, b) => (a.date >= b.date ? a : b)).date;
  }

  async unlinkUserFromMembers(userId: string): Promise<void> {
    for (const m of getStore().members) {
      if (m.linkedUserId === userId) m.linkedUserId = null;
    }
  }

  async deleteAccountAndSoleSpaces(userId: string): Promise<void> {
    const store = getStore();
    const mine = store.members.filter((m) => m.linkedUserId === userId).map((m) => m.spaceId);
    const soleSpaces = [...new Set(mine)].filter(
      (sid) => store.members.filter((m) => m.spaceId === sid).length === 1,
    );
    store.expenses = store.expenses.filter((e) => !soleSpaces.includes(e.spaceId ?? ""));
    store.members = store.members.filter((m) => !soleSpaces.includes(m.spaceId));
    store.spaces = store.spaces.filter((s) => !soleSpaces.includes(s.id));
    await this.unlinkUserFromMembers(userId);
    store.appUsers = store.appUsers.filter((u) => u.id !== userId);
  }

  async createPasswordResetToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void> {
    getStore().resetTokens.push({ ...input });
  }

  async consumePasswordResetToken(tokenHash: string): Promise<{ userId: string } | null> {
    const t = getStore().resetTokens.find(
      (x) => x.tokenHash === tokenHash && !x.usedAt && x.expiresAt > new Date().toISOString(),
    );
    if (!t) return null;
    t.usedAt = new Date().toISOString();
    return { userId: t.userId };
  }

  async listIncome(spaceId: string): Promise<Income[]> {
    return getStore()
      .income.filter((i) => i.spaceId === spaceId)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  async createIncome(input: CreateIncomeInput): Promise<Income> {
    const entry: Income = { ...input, id: `inc_${randomUUID()}` };
    getStore().income.push(entry);
    return entry;
  }

  async deleteIncome(id: string, spaceId: string): Promise<void> {
    const store = getStore();
    store.income = store.income.filter((i) => !(i.id === id && i.spaceId === spaceId));
  }

  async listExpenseUids(spaceId: string): Promise<{ id: string; uid: string }[]> {
    return getStore()
      .expenses.filter((e) => (e.spaceId ?? "casa") === spaceId && !e.deletedAt)
      .map((e) => ({ id: e.id, uid: e.uid }));
  }

  async createImportBatch(input: CreateImportBatchInput): Promise<ImportBatch> {
    const batch: ImportBatch = {
      id: `imp_${randomUUID()}`,
      spaceId: input.spaceId,
      source: input.source,
      fileName: input.fileName ?? null,
      rowCount: input.rowCount,
      importedCount: input.importedCount,
      duplicateCount: input.duplicateCount,
      lastTransactionDate: input.lastTransactionDate ?? null,
      createdBy: input.createdBy ?? null,
      createdAt: new Date().toISOString(),
    };
    getStore().importBatches.unshift(batch);
    return batch;
  }

  async listImportBatches(spaceId: string): Promise<ImportBatch[]> {
    return getStore()
      .importBatches.filter((b) => b.spaceId === spaceId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async undoImportBatch(batchId: string, spaceId: string, _userId: string): Promise<number> {
    const store = getStore();
    const now = new Date().toISOString();
    let removed = 0;
    for (const e of store.expenses) {
      if (e.importBatchId !== batchId || (e.spaceId ?? "casa") !== spaceId || e.deletedAt) continue;
      e.deletedAt = now;
      e.updatedAt = now;
      removed += 1;
    }
    store.importBatches = store.importBatches.filter(
      (b) => !(b.id === batchId && b.spaceId === spaceId),
    );
    return removed;
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
