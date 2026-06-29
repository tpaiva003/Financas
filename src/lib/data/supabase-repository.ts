/**
 * Repositório Supabase (Postgres). Mapeia linhas snake_case ↔ domínio camelCase.
 *
 * As queries correspondem ao schema em `supabase/migrations`. A privacidade das
 * despesas pessoais é aplicada aqui (camada de aplicação) — ver server.ts.
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { normalizeText, stableUid } from "@/lib/domain";
import type { Currency, Expense, Settlement, ClassificationRule, Split } from "@/lib/domain";
import type {
  AddMemberInput,
  Category,
  ContactMessage,
  CreateContactInput,
  CreateExpenseInput,
  CreateSettlementInput,
  CreateSpaceInput,
  ExpenseFilters,
  Member,
  Repository,
  Space,
} from "./repository";

function rowToExpense(r: any): Expense {
  return {
    id: r.id,
    spaceId: r.space_id,
    uid: r.uid,
    description: r.description,
    amountCents: r.amount_cents,
    currency: r.currency as Currency,
    transactionDate: r.transaction_date,
    postedDate: r.posted_date,
    categoryId: r.category_id,
    payerId: r.payer_id,
    kind: r.kind,
    split: (r.split ?? { type: "EQUAL" }) as Split,
    origin: r.origin,
    status: r.status,
    ownerId: r.owner_id,
    visibleToPartner: r.visible_to_partner,
    receiptPath: r.receipt_path,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

function rowToSettlement(r: any): Settlement {
  return {
    id: r.id,
    spaceId: r.space_id,
    fromUserId: r.from_user_id,
    toUserId: r.to_user_id,
    amountCents: r.amount_cents,
    currency: r.currency as Currency,
    date: r.date,
    note: r.note,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

export class SupabaseRepository implements Repository {
  async listSpacesForUser(userId: string): Promise<Space[]> {
    const db = getSupabaseAdmin();
    const { data: mem, error: e1 } = await db
      .from("members")
      .select("space_id")
      .eq("linked_user_id", userId);
    if (e1) throw new Error(e1.message);
    const ids = [...new Set((mem ?? []).map((m: any) => m.space_id))];
    if (ids.length === 0) return [];
    const { data, error } = await db.from("spaces").select("*").in("id", ids).order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      createdBy: r.created_by,
      createdAt: r.created_at,
    }));
  }

  async getSpace(spaceId: string): Promise<Space | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("spaces").select("*").eq("id", spaceId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return { id: data.id, name: data.name, createdBy: data.created_by, createdAt: data.created_at };
  }

  async createSpace(input: CreateSpaceInput): Promise<Space> {
    const db = getSupabaseAdmin();
    const id = crypto.randomUUID();
    const { data, error } = await db
      .from("spaces")
      .insert({ id, name: input.name, created_by: input.createdBy })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const rows = input.members.map((m) => ({
      id: crypto.randomUUID(),
      space_id: id,
      name: m.name,
      linked_user_id: m.linkedUserId ?? null,
      email: m.email ?? null,
    }));
    if (rows.length) {
      const { error: e2 } = await db.from("members").insert(rows);
      if (e2) throw new Error(e2.message);
    }
    return { id: data.id, name: data.name, createdBy: data.created_by, createdAt: data.created_at };
  }

  async listMembers(spaceId: string): Promise<Member[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("members")
      .select("*")
      .eq("space_id", spaceId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      spaceId: r.space_id,
      name: r.name,
      linkedUserId: r.linked_user_id,
      email: r.email,
    }));
  }

  async addMember(input: AddMemberInput): Promise<Member> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("members")
      .insert({
        id: crypto.randomUUID(),
        space_id: input.spaceId,
        name: input.name,
        linked_user_id: input.linkedUserId ?? null,
        email: input.email ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return {
      id: data.id,
      spaceId: data.space_id,
      name: data.name,
      linkedUserId: data.linked_user_id,
      email: data.email,
    };
  }

  async listExpenses(filters: ExpenseFilters): Promise<Expense[]> {
    const db = getSupabaseAdmin();
    let q = db.from("expenses").select("*").eq("space_id", filters.spaceId);

    if (!filters.includeDeleted) q = q.is("deleted_at", null);
    if (filters.from) q = q.gte("transaction_date", filters.from);
    if (filters.to) q = q.lte("transaction_date", filters.to);
    if (filters.categoryId) q = q.eq("category_id", filters.categoryId);
    if (filters.payerId) q = q.eq("payer_id", filters.payerId);
    if (filters.kind) q = q.eq("kind", filters.kind);

    const { data, error } = await q.order("transaction_date", { ascending: false });
    if (error) throw new Error(error.message);

    let rows = (data ?? []).map(rowToExpense);
    // Privacidade das pessoais (camada de aplicação).
    rows = rows.filter(
      (e) => e.kind === "shared" || e.ownerId === filters.viewerId || e.visibleToPartner === true,
    );
    if (filters.query) {
      const needle = normalizeText(filters.query);
      rows = rows.filter((e) => normalizeText(e.description).includes(needle));
    }
    return rows;
  }

  async getExpense(id: string, viewerId: string): Promise<Expense | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("expenses").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const e = rowToExpense(data);
    if (e.kind !== "shared" && e.ownerId !== viewerId && e.visibleToPartner !== true) return null;
    return e;
  }

  async createExpense(input: CreateExpenseInput): Promise<Expense> {
    const db = getSupabaseAdmin();
    const uid = stableUid({
      source: input.origin,
      description: input.description,
      amountCents: input.amountCents,
      currency: input.currency,
      transactionDate: input.transactionDate,
      account: null,
    });
    const { data, error } = await db
      .from("expenses")
      .insert({
        space_id: input.spaceId,
        uid,
        description: input.description,
        amount_cents: input.amountCents,
        currency: input.currency,
        transaction_date: input.transactionDate,
        posted_date: input.postedDate ?? null,
        category_id: input.categoryId ?? null,
        payer_id: input.payerId,
        kind: input.kind,
        split: input.split,
        origin: input.origin,
        status: input.status ?? "confirmed",
        owner_id: input.ownerId,
        visible_to_partner: input.visibleToPartner ?? false,
        created_by: input.createdBy,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToExpense(data);
  }

  async updateExpense(
    id: string,
    input: import("./repository").UpdateExpenseInput,
  ): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("expenses")
      .update({
        description: input.description,
        amount_cents: input.amountCents,
        transaction_date: input.transactionDate,
        category_id: input.categoryId ?? null,
        payer_id: input.payerId,
        kind: input.kind,
        split: input.split,
        owner_id: input.ownerId,
        visible_to_partner: input.visibleToPartner ?? false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async setReceiptPath(id: string, path: string | null): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from("expenses").update({ receipt_path: path }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async softDeleteExpense(id: string, _actorId: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("expenses")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async listSettlements(spaceId: string): Promise<Settlement[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("settlements")
      .select("*")
      .eq("space_id", spaceId)
      .order("date", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToSettlement);
  }

  async createSettlement(input: CreateSettlementInput): Promise<Settlement> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("settlements")
      .insert({
        space_id: input.spaceId,
        from_user_id: input.fromUserId,
        to_user_id: input.toUserId,
        amount_cents: input.amountCents,
        currency: input.currency,
        date: input.date,
        note: input.note ?? null,
        created_by: input.createdBy,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToSettlement(data);
  }

  async listCategories(): Promise<Category[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("categories").select("*").order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      icon: r.icon,
    }));
  }

  async listClassificationRules(): Promise<ClassificationRule[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("classification_rules")
      .select("*")
      .order("priority");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      keyword: r.keyword,
      categoryId: r.category_id,
      kind: r.kind,
      priority: r.priority,
      enabled: r.enabled,
    }));
  }

  async getUserPasswordHash(userId: string): Promise<string | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("app_users")
      .select("password_hash")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.password_hash ?? null;
  }

  async setUserPasswordHash(userId: string, hash: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from("app_users").update({ password_hash: hash }).eq("id", userId);
    if (error) throw new Error(error.message);
  }

  async createContactMessage(input: CreateContactInput): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from("contact_messages").insert({
      name: input.name ?? null,
      email: input.email,
      message: input.message,
      consent: true,
    });
    if (error) throw new Error(error.message);
  }

  async listContactMessages(): Promise<ContactMessage[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("contact_messages")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      message: r.message,
      createdAt: r.created_at,
      readAt: r.read_at,
    }));
  }

  async markContactMessageRead(id: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("contact_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }
}
