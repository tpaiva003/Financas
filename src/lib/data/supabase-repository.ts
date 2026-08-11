/**
 * Repositório Supabase (Postgres). Mapeia linhas snake_case ↔ domínio camelCase.
 *
 * As queries correspondem ao schema em `supabase/migrations`. A privacidade das
 * despesas pessoais é aplicada aqui (camada de aplicação), ver server.ts.
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { buildCrescimento, isTicketStatus, lerCenarios, normalizeText, stableUid } from "@/lib/domain";
import type { EtapaAvaliacao, SpacePlan, TicketStatus } from "@/lib/domain";
import type { Currency, Expense, Settlement, ClassificationRule, Split } from "@/lib/domain";
import type {
  AddMemberInput,
  AppUser,
  Category,
  ContactMessage,
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
  AssetAttachment,
  CreateAssetAttachment,
  Ticket,
  TicketMessage,
  StoredAssetSplit,
  CreateAssetSplitInput,
  StoredValuation,
  CreateValuationInput,
  CreateTicketInput,
  CreateTicketMessageInput,
  Income,
  CreateIncomeInput,
  Membership,
  PlatformStats,
  ReminderFrequency,
  CreateCategoryInput,
  CreateContactInput,
  CreateExpenseInput,
  CreateSettlementInput,
  CreateSpaceInput,
  ExpenseFilters,
  Member,
  CreateRecurringInput,
  RecurringTemplate,
  Repository,
  Space,
  UpdateCategoryInput,
  UpdateMemberInput,
  UpdateRecurringInput,
} from "./repository";
import { randomUUID } from "node:crypto";

/** O tecto de linhas por pedido da API do Supabase. Não é configurável daqui. */
const PAGINA = 1000;

/**
 * Lê uma consulta inteira, em páginas.
 *
 * **A API do Supabase devolve no máximo mil linhas por pedido, e não avisa.** Não
 * há erro, não há campo a dizer "há mais": vêm mil linhas como se fossem todas.
 * Uma consulta que passe a barreira dos mil passa a mentir em silêncio, e o dia
 * em que isso acontece é o dia em que a tabela cresceu, não o dia em que alguém
 * mexeu no código — por isso não há teste que o apanhe a tempo.
 *
 * Custou uma vez: as cotações do MSFT vinham cortadas e a página mostrava o fecho
 * de julho de 2020 como se fosse o de hoje, com a data ao lado a dar-lhe
 * credibilidade. Aqui só se perdiam cotações; nas despesas perder-se-ia o saldo,
 * que **tem de ser sempre explicável até às despesas que o compõem**.
 *
 * Daí este ajudante em vez de um `.range()` em cada sítio: quem escrever a
 * próxima consulta não tem de se lembrar do limite, só tem de a passar por aqui.
 */
export async function todasAsLinhas<T>(
  pagina: (
    de: number,
    ate: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const todas: T[] = [];
  // Um tecto de sanidade: mesmo que algo corra mal, isto não fica a rodar.
  for (let de = 0; de < 200_000; de += PAGINA) {
    const { data, error } = await pagina(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    const linhas = data ?? [];
    todas.push(...linhas);
    // Uma página incompleta é a última: não há forma mais barata de saber.
    if (linhas.length < PAGINA) break;
  }
  return todas;
}

function rowToTemplate(r: any): ImportTemplate {
  return {
    id: r.id,
    fingerprint: r.fingerprint,
    label: r.label,
    header: Array.isArray(r.header) ? r.header : [],
    mapping: r.mapping ?? {},
    uses: r.uses ?? 0,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

function rowToImportBatch(r: any): ImportBatch {
  return {
    id: r.id,
    lastTransactionDate: r.last_transaction_date ?? null,
    spaceId: r.space_id,
    source: r.source,
    fileName: r.file_name,
    rowCount: r.row_count ?? 0,
    importedCount: r.imported_count ?? 0,
    duplicateCount: r.duplicate_count ?? 0,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

function rowToRecurring(r: any): RecurringTemplate {
  return {
    id: r.id,
    spaceId: r.space_id,
    description: r.description,
    categoryId: r.category_id,
    payerId: r.payer_id,
    kind: r.kind,
    split: (r.split ?? { type: "EQUAL" }) as Split,
    amountCents: r.amount_cents ?? null,
    valueType: r.value_type,
    frequency: r.frequency,
    nextDate: r.next_date,
    endDate: r.end_date,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

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
    settledAt: r.settled_at ?? null,
    recurringId: r.recurring_id ?? null,
    importBatchId: r.import_batch_id ?? null,
    approvalStatus: r.approval_status ?? null,
    approverId: r.approver_id ?? null,
    submittedBy: r.submitted_by ?? null,
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
    // A coluna `position` pode não existir se a migração 0010 ainda não correu.
    let rows: any[] | null = null;
    const ordered = await db
      .from("spaces")
      .select("*")
      .in("id", ids)
      .order("position")
      .order("created_at");
    if (ordered.error) {
      const fallback = await db.from("spaces").select("*").in("id", ids).order("created_at");
      if (fallback.error) throw new Error(fallback.error.message);
      rows = fallback.data;
    } else {
      rows = ordered.data;
    }
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      position: r.position ?? 0,
      plan: (r.plan as SpacePlan) ?? "free",
      createdBy: r.created_by,
      createdAt: r.created_at,
    }));
  }

  async getSpace(spaceId: string): Promise<Space | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("spaces").select("*").eq("id", spaceId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      plan: (data.plan as SpacePlan) ?? "free",
      createdBy: data.created_by,
      createdAt: data.created_at,
    };
  }

  async countInSpace(
    spaceId: string,
    what: "expenses" | "assets" | "members",
  ): Promise<number> {
    const db = getSupabaseAdmin();
    // `head: true` traz o número sem trazer uma única linha: um tecto não
    // precisa de ler dados de ninguém para saber que está cheio.
    let q = db.from(what).select("id", { count: "exact", head: true }).eq("space_id", spaceId);
    // Uma despesa apagada não ocupa lugar: seria estranho ficar sem espaço por
    // causa do que já se apagou.
    if (what === "expenses") q = q.is("deleted_at", null);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async createSpace(input: CreateSpaceInput): Promise<Space> {
    const db = getSupabaseAdmin();
    const id = crypto.randomUUID();
    const { data, error } = await db
      .from("spaces")
      .insert({ id, name: input.name, created_by: input.createdBy, plan: input.plan ?? "free" })
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
    return {
      id: data.id,
      name: data.name,
      plan: (data.plan as SpacePlan) ?? "free",
      createdBy: data.created_by,
      createdAt: data.created_at,
    };
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
      role: (r.role ?? "full") as Member["role"],
      participatesFrom: r.participates_from ?? null,
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
        participates_from: input.participatesFrom ?? null,
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
      participatesFrom: data.participates_from ?? null,
    };
  }

  async updateMember(id: string, spaceId: string, patch: UpdateMemberInput): Promise<void> {
    const db = getSupabaseAdmin();
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.email !== undefined) update.email = patch.email;
    if (patch.role !== undefined) update.role = patch.role;
    if (patch.linkedUserId !== undefined) update.linked_user_id = patch.linkedUserId;
    if (patch.participatesFrom !== undefined) update.participates_from = patch.participatesFrom;
    if (Object.keys(update).length === 0) return;
    const { error } = await db
      .from("members")
      .update(update)
      .eq("id", id)
      .eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  async deleteMember(id: string, spaceId: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from("members").delete().eq("id", id).eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  async countMemberActivity(memberId: string): Promise<number> {
    const db = getSupabaseAdmin();
    const exp = await db
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .or(`payer_id.eq.${memberId},owner_id.eq.${memberId}`);
    if (exp.error) throw new Error(exp.error.message);
    const set = await db
      .from("settlements")
      .select("id", { count: "exact", head: true })
      .or(`from_user_id.eq.${memberId},to_user_id.eq.${memberId}`);
    if (set.error) throw new Error(set.error.message);
    return (exp.count ?? 0) + (set.count ?? 0);
  }

  async listExpenses(filters: ExpenseFilters): Promise<Expense[]> {
    const db = getSupabaseAdmin();
    // Paginado porque o saldo se calcula sobre isto: um corte aos mil dava um
    // saldo errado que ninguém conseguia explicar até às despesas que o compõem.
    const data = await todasAsLinhas<any>((de, ate) => {
      let q = db.from("expenses").select("*").eq("space_id", filters.spaceId);

      if (!filters.includeDeleted) q = q.is("deleted_at", null);
      if (filters.from) q = q.gte("transaction_date", filters.from);
      if (filters.to) q = q.lte("transaction_date", filters.to);
      if (filters.categoryId) q = q.eq("category_id", filters.categoryId);
      if (filters.payerId) q = q.eq("payer_id", filters.payerId);
      if (filters.kind) q = q.eq("kind", filters.kind);

      return q.order("transaction_date", { ascending: false }).range(de, ate);
    });

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

  async getExpense(id: string, spaceId: string, viewerId: string): Promise<Expense | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("expenses")
      .select("*")
      .eq("id", id)
      .eq("space_id", spaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const e = rowToExpense(data);
    if (e.kind !== "shared" && e.ownerId !== viewerId && e.visibleToPartner !== true) return null;
    return e;
  }

  async createExpense(input: CreateExpenseInput): Promise<Expense> {
    const db = getSupabaseAdmin();
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
        recurring_id: input.recurringId ?? null,
        // Só enviamos a coluna quando há lote, para a app continuar a importar
        // mesmo que a migração dos lotes ainda não esteja aplicada.
        ...(input.importBatchId ? { import_batch_id: input.importBatchId } : {}),
        approval_status: input.approvalStatus ?? null,
        approver_id: input.approverId ?? null,
        submitted_by: input.submittedBy ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToExpense(data);
  }

  async updateExpense(
    id: string,
    spaceId: string,
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
      .eq("id", id)
      .eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  async setReceiptPath(id: string, spaceId: string, path: string | null): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("expenses")
      .update({ receipt_path: path })
      .eq("id", id)
      .eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  async softDeleteExpense(id: string, spaceId: string, _actorId: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("expenses")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  async settleOpenExpenses(spaceId: string): Promise<number> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("expenses")
      .update({ settled_at: new Date().toISOString() })
      .eq("space_id", spaceId)
      .eq("kind", "shared")
      .eq("status", "confirmed")
      .is("deleted_at", null)
      .is("settled_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  }

  async reopenExpenses(spaceId: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("expenses")
      .update({ settled_at: null })
      .eq("space_id", spaceId)
      .not("settled_at", "is", null);
    if (error) throw new Error(error.message);
  }

  async confirmExpense(id: string, spaceId: string, amountCents: number): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("expenses")
      .update({ amount_cents: amountCents, status: "confirmed" })
      .eq("id", id)
      .eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  async listRecurring(spaceId: string): Promise<RecurringTemplate[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("recurring_templates")
      .select("*")
      .eq("space_id", spaceId)
      .order("next_date");
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToRecurring);
  }

  async getRecurring(id: string, spaceId: string): Promise<RecurringTemplate | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("recurring_templates")
      .select("*")
      .eq("id", id)
      .eq("space_id", spaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? rowToRecurring(data) : null;
  }

  async createRecurring(input: CreateRecurringInput): Promise<RecurringTemplate> {
    const db = getSupabaseAdmin();
    const id = `rec_${randomUUID()}`;
    const { data, error } = await db
      .from("recurring_templates")
      .insert({
        id,
        space_id: input.spaceId,
        description: input.description,
        category_id: input.categoryId ?? null,
        payer_id: input.payerId,
        kind: input.kind,
        split: input.split,
        amount_cents: input.amountCents ?? null,
        value_type: input.valueType,
        frequency: input.frequency,
        next_date: input.nextDate,
        end_date: input.endDate ?? null,
        status: "active",
        created_by: input.createdBy ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToRecurring(data);
  }

  async updateRecurring(id: string, spaceId: string, patch: UpdateRecurringInput): Promise<void> {
    const db = getSupabaseAdmin();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.description !== undefined) update.description = patch.description;
    if (patch.categoryId !== undefined) update.category_id = patch.categoryId;
    if (patch.payerId !== undefined) update.payer_id = patch.payerId;
    if (patch.split !== undefined) update.split = patch.split;
    if (patch.amountCents !== undefined) update.amount_cents = patch.amountCents;
    if (patch.valueType !== undefined) update.value_type = patch.valueType;
    if (patch.frequency !== undefined) update.frequency = patch.frequency;
    if (patch.nextDate !== undefined) update.next_date = patch.nextDate;
    if (patch.endDate !== undefined) update.end_date = patch.endDate;
    if (patch.status !== undefined) update.status = patch.status;
    const { error } = await db
      .from("recurring_templates")
      .update(update)
      .eq("id", id)
      .eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  async deleteRecurring(id: string, spaceId: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("recurring_templates")
      .delete()
      .eq("id", id)
      .eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  async recurringExpenseExists(recurringId: string, transactionDate: string): Promise<boolean> {
    const db = getSupabaseAdmin();
    const { count, error } = await db
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("recurring_id", recurringId)
      .eq("transaction_date", transactionDate)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    return (count ?? 0) > 0;
  }

  async updateExpensesForRecurring(
    recurringId: string,
    patch: { description: string; categoryId: string | null; payerId: string; split: Split },
    amount?: { cents: number; onlyPending: boolean },
  ): Promise<void> {
    const db = getSupabaseAdmin();
    const base = {
      description: patch.description,
      category_id: patch.categoryId,
      payer_id: patch.payerId,
      split: patch.split,
    };

    // Campos comuns em todas as despesas geradas (não eliminadas).
    const { error: e1 } = await db
      .from("expenses")
      .update(base)
      .eq("recurring_id", recurringId)
      .is("deleted_at", null);
    if (e1) throw new Error(e1.message);

    // Valor: todas, ou só as pendentes (estimativas de valor variável).
    if (amount) {
      let q = db
        .from("expenses")
        .update({ amount_cents: amount.cents })
        .eq("recurring_id", recurringId)
        .is("deleted_at", null);
      if (amount.onlyPending) q = q.eq("status", "pending");
      const { error: e2 } = await q;
      if (e2) throw new Error(e2.message);
    }
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

  async listCategories(spaceId?: string): Promise<Category[]> {
    const db = getSupabaseAdmin();
    let query = db.from("categories").select("*").order("name");
    query = spaceId
      ? query.or(`space_id.is.null,space_id.eq.${spaceId}`)
      : query.is("space_id", null);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      icon: r.icon,
      spaceId: r.space_id ?? null,
    }));
  }

  async createCategory(input: CreateCategoryInput): Promise<Category> {
    const db = getSupabaseAdmin();
    const id = `cat_${randomUUID()}`;
    const { error } = await db.from("categories").insert({
      id,
      name: input.name,
      color: input.color,
      icon: input.icon ?? null,
      space_id: input.spaceId,
    });
    if (error) throw new Error(error.message);
    return { id, name: input.name, color: input.color, icon: input.icon ?? undefined, spaceId: input.spaceId };
  }

  async updateCategory(id: string, spaceId: string, patch: UpdateCategoryInput): Promise<void> {
    const db = getSupabaseAdmin();
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.color !== undefined) update.color = patch.color;
    if (patch.icon !== undefined) update.icon = patch.icon ?? null;
    if (Object.keys(update).length === 0) return;
    // Só permite editar categorias do próprio ambiente (nunca as padrão).
    const { error } = await db
      .from("categories")
      .update(update)
      .eq("id", id)
      .eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  async deleteCategory(id: string, spaceId: string): Promise<void> {
    const db = getSupabaseAdmin();
    // FK on delete set null nas despesas => ficam sem categoria.
    const { error } = await db
      .from("categories")
      .delete()
      .eq("id", id)
      .eq("space_id", spaceId);
    if (error) throw new Error(error.message);
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

  async getAppUserByEmail(email: string): Promise<AppUser | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("app_users")
      .select("id, email, name")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { id: data.id, email: data.email, name: data.name } : null;
  }

  async createAppUser(input: AppUser): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("app_users")
      .upsert({ id: input.id, email: input.email.toLowerCase(), name: input.name }, { onConflict: "id" });
    if (error) throw new Error(error.message);
  }

  async deleteAppUser(id: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from("app_users").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async setExpenseApproval(
    id: string,
    spaceId: string,
    status: "approved" | "rejected",
  ): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("expenses")
      .update({ approval_status: status === "approved" ? null : "rejected" })
      .eq("id", id)
      .eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  async reorderSpaces(spaceIds: string[]): Promise<void> {
    const db = getSupabaseAdmin();
    for (let i = 0; i < spaceIds.length; i++) {
      const { error } = await db.from("spaces").update({ position: i }).eq("id", spaceIds[i]!);
      if (error) throw new Error(error.message);
    }
  }

  async renameSpace(spaceId: string, name: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from("spaces").update({ name }).eq("id", spaceId);
    if (error) throw new Error(error.message);
  }

  async listAppUsers(): Promise<AppUser[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("app_users").select("id, email, name").order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({ id: r.id, email: r.email, name: r.name }));
  }

  async findImportTemplate(fingerprint: string): Promise<ImportTemplate | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("import_templates")
      .select("*")
      .eq("fingerprint", fingerprint)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? rowToTemplate(data) : null;
  }

  async saveImportTemplate(
    input: Omit<ImportTemplate, "id" | "uses" | "createdAt">,
  ): Promise<void> {
    const db = getSupabaseAdmin();
    const existing = await this.findImportTemplate(input.fingerprint);
    if (existing) {
      const { error } = await db
        .from("import_templates")
        .update({ uses: existing.uses + 1, label: input.label, mapping: input.mapping })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return;
    }
    const { error } = await db.from("import_templates").insert({
      id: `tpl_${randomUUID()}`,
      fingerprint: input.fingerprint,
      label: input.label,
      header: input.header,
      mapping: input.mapping,
      uses: 1,
      created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async listImportTemplates(): Promise<ImportTemplate[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("import_templates")
      .select("*")
      .order("uses", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToTemplate);
  }

  async listImportReminders(spaceId: string): Promise<ImportReminder[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("import_reminders")
      .select("*")
      .eq("space_id", spaceId)
      .order("source");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      spaceId: r.space_id,
      source: r.source,
      label: r.label,
      frequency: r.frequency as ReminderFrequency,
      active: r.active,
      createdAt: r.created_at,
    }));
  }

  async upsertImportReminder(input: {
    spaceId: string;
    source: string;
    label?: string | null;
    frequency: ReminderFrequency;
    active: boolean;
    createdBy?: string | null;
  }): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from("import_reminders").upsert(
      {
        id: `rem_${randomUUID()}`,
        space_id: input.spaceId,
        source: input.source,
        label: input.label ?? null,
        frequency: input.frequency,
        active: input.active,
        created_by: input.createdBy ?? null,
      },
      { onConflict: "space_id,source" },
    );
    if (error) throw new Error(error.message);
  }

  async deleteImportReminder(spaceId: string, source: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("import_reminders")
      .delete()
      .eq("space_id", spaceId)
      .eq("source", source);
    if (error) throw new Error(error.message);
  }

  async listMembershipsInSpaces(spaceIds: string[]): Promise<Membership[]> {
    if (spaceIds.length === 0) return [];
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("members")
      .select("space_id, linked_user_id")
      .in("space_id", spaceIds);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      spaceId: r.space_id as string,
      linkedUserId: (r.linked_user_id as string | null) ?? null,
    }));
  }

  async getPlatformStats(): Promise<PlatformStats> {
    const db = getSupabaseAdmin();
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

    const warnings: string[] = [];

    /**
     * Cada leitura é independente: se uma falhar, a consola mostra o resto e
     * diz o que faltou. Uma chamada rejeitada (aconteceu um 401 transitório do
     * gateway) não pode transformar a página num beco sem saída.
     *
     * Uma repetição, porque estas falhas costumam ser passageiras.
     */
    async function read<T>(
      label: string,
      run: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    ): Promise<T[] | null> {
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data, error } = await run();
        if (!error) return data ?? [];
        if (attempt === 1) {
          warnings.push(`${label}: ${error.message}`);
          return null;
        }
      }
      return null;
    }

    /**
     * O mesmo, mas por páginas.
     *
     * **A consola contava até mil e calava-se.** O PostgREST corta em mil
     * linhas sem avisar, e nenhuma destas leituras pedia páginas: acima disso,
     * "despesas" ficava em 1000 para sempre e os ambientes que sobrassem
     * apareciam sem uma única despesa. Um tecto que se apresenta como total é
     * o modo de falha nº 1 desta app, e a consola era o sítio onde ele estava
     * mais à vontade — ninguém confere um número de gestão contra nada.
     */
    async function readAll<T>(
      label: string,
      pagina: (
        de: number,
        ate: number,
      ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    ): Promise<T[] | null> {
      try {
        return await todasAsLinhas<T>(pagina);
      } catch (e) {
        warnings.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    }

    const [spaceRows, memberRows, expenseRows, accountRows] = await Promise.all([
      readAll<{ id: string; name: string; created_at: string }>("ambientes", (de, ate) =>
        db.from("spaces").select("id, name, created_at").range(de, ate),
      ),
      readAll<{ space_id: string; linked_user_id: string | null }>("participantes", (de, ate) =>
        db.from("members").select("space_id, linked_user_id").range(de, ate),
      ),
      // Só o que é preciso para contar e datar: nunca descrições nem valores.
      // O `created_at` é o que diz quando alguém USOU a app; o
      // `transaction_date` diz quando a compra foi feita, e quem importa dois
      // anos de extrato numa noite tem duas coisas muito diferentes.
      readAll<{ space_id: string; transaction_date: string; created_at: string }>(
        "despesas",
        (de, ate) =>
          db
            .from("expenses")
            .select("space_id, transaction_date, created_at")
            .is("deleted_at", null)
            .range(de, ate),
      ),
      readAll<{ id: string; created_at: string }>("contas", (de, ate) =>
        db.from("app_users").select("id, created_at").range(de, ate),
      ),
    ]);

    /**
     * Uso por funcionalidade. Só `space_id`, nunca conteúdo: continua a valer a
     * regra da consola. Cada leitura é independente e tolerante a tabelas que
     * ainda não existam, porque uma migração por correr não pode deitar a
     * página abaixo.
     */
    const FEATURES: { id: string; label: string; table: string }[] = [
      { id: "patrimonio", label: "Património", table: "assets" },
      { id: "investimentos", label: "Movimentos de investimentos", table: "asset_trades" },
      { id: "rendimentos", label: "Rendimentos", table: "income" },
      { id: "recorrentes", label: "Recorrentes", table: "recurring_templates" },
      { id: "importacoes", label: "Importações", table: "import_batches" },
      { id: "metas", label: "Metas de despesa", table: "spending_goals" },
    ];

    const featureRows = await Promise.all(
      FEATURES.map(async (f) => {
        // Também por páginas, e também com `created_at`: estas linhas são o
        // que faz a curva de uso, e não só a contagem de quem usa o quê.
        const rows = await todasAsLinhas<{ space_id: string; created_at: string }>((de, ate) =>
          db.from(f.table).select("space_id, created_at").range(de, ate),
        ).catch(() => [] as { space_id: string; created_at: string }[]);
        return { ...f, rows };
      }),
    );

    const featuresBySpace = new Map<string, string[]>();
    for (const f of featureRows) {
      for (const r of f.rows) {
        if (!r?.space_id) continue;
        const atuais = featuresBySpace.get(r.space_id) ?? [];
        if (!atuais.includes(f.id)) featuresBySpace.set(r.space_id, [...atuais, f.id]);
      }
    }

    const membersRes = { data: memberRows };
    const expensesRes = { data: expenseRows };
    const spacesRes = { data: spaceRows };

    const memberCounts = new Map<string, number>();
    for (const m of membersRes.data ?? []) {
      const id = (m as any).space_id as string;
      memberCounts.set(id, (memberCounts.get(id) ?? 0) + 1);
    }
    const expenseCounts = new Map<string, number>();
    const lastBySpace = new Map<string, string>();
    for (const e of expensesRes.data ?? []) {
      const id = (e as any).space_id as string;
      const date = (e as any).transaction_date as string;
      expenseCounts.set(id, (expenseCounts.get(id) ?? 0) + 1);
      const cur = lastBySpace.get(id);
      if (!cur || date > cur) lastBySpace.set(id, date);
    }

    const spaces = (spacesRes.data ?? []).map((s: any) => ({
      id: s.id as string,
      name: s.name as string,
      memberCount: memberCounts.get(s.id) ?? 0,
      expenseCount: expenseCounts.get(s.id) ?? 0,
      lastActivity: lastBySpace.get(s.id) ?? null,
      createdAt: s.created_at as string,
      features: featuresBySpace.get(s.id) ?? [],
    }));

    // Os templates podem não existir (migração 0011 por aplicar).
    const templates = await this.listImportTemplates().catch(() => []);

    // Se a tabela de contas não respondeu, ainda dá para saber quantas contas
    // distintas participam nos ambientes, melhor do que não dizer nada.
    const linkedAccounts = new Set(
      (memberRows ?? [])
        .map((m) => (m as unknown as { linked_user_id?: string | null }).linked_user_id)
        .filter((id): id is string => Boolean(id)),
    );

    /**
     * A curva de uso.
     *
     * Os eventos são todos os registos que entraram na app — despesas e o que
     * cada funcionalidade criou — datados por `created_at`. Ver o cabeçalho do
     * `plataforma.ts` para a razão de não ser `transaction_date`.
     */
    const crescimento =
      spaceRows && accountRows
        ? buildCrescimento({
            hoje: new Date().toISOString().slice(0, 10),
            contas: accountRows.map((a) => a.created_at).filter(Boolean),
            ambientes: spaceRows.map((s) => ({ id: s.id, createdAt: s.created_at })),
            eventos: [
              ...(expenseRows ?? []).map((e) => ({
                spaceId: e.space_id,
                createdAt: e.created_at ?? e.transaction_date,
              })),
              ...featureRows.flatMap((f) =>
                f.rows.map((r) => ({ spaceId: r.space_id, createdAt: r.created_at })),
              ),
            ].filter((e) => e.spaceId && e.createdAt),
          })
        : null;

    return {
      accountCount: accountRows ? accountRows.length : null,
      crescimento,
      spaceCount: spaceRows ? spaces.length : null,
      expenseCount: expenseRows ? expenseRows.length : null,
      activeSpaces:
        spaceRows && expenseRows
          ? spaces.filter((s) => s.lastActivity !== null && s.lastActivity >= cutoff).length
          : null,
      spaces: spaces.sort((a, b) => ((a.lastActivity ?? "") < (b.lastActivity ?? "") ? 1 : -1)),
      templates: templates.map((t) => ({ label: t.label, uses: t.uses })),
      features: featureRows.map((f) => ({
        id: f.id,
        label: f.label,
        spaces: new Set(f.rows.map((r) => r.space_id).filter(Boolean)).size,
        records: f.rows.length,
      })),
      warnings:
        accountRows === null && linkedAccounts.size > 0
          ? [...warnings, `Contas com ambiente (estimativa): ${linkedAccounts.size}.`]
          : warnings,
    };
  }

  async listSpendingGoals(spaceId: string): Promise<SpendingGoal[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("spending_goals")
      .select("*")
      .eq("space_id", spaceId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      spaceId: r.space_id as string,
      categoryId: (r.category_id as string | null) ?? null,
      amountCents: r.amount_cents as number,
      createdAt: r.created_at as string,
    }));
  }

  async upsertSpendingGoal(input: {
    spaceId: string;
    categoryId: string | null;
    amountCents: number;
    createdBy?: string | null;
  }): Promise<void> {
    const db = getSupabaseAdmin();
    // O índice único usa coalesce(category_id, '__total__'), que o upsert do
    // PostgREST não sabe resolver: procuramos primeiro e depois gravamos.
    let query = db.from("spending_goals").select("id").eq("space_id", input.spaceId);
    query = input.categoryId
      ? query.eq("category_id", input.categoryId)
      : query.is("category_id", null);
    const { data: existing, error: findError } = await query.maybeSingle();
    if (findError) throw new Error(findError.message);

    if (existing) {
      const { error } = await db
        .from("spending_goals")
        .update({ amount_cents: input.amountCents, updated_at: new Date().toISOString() })
        .eq("id", existing.id as string);
      if (error) throw new Error(error.message);
      return;
    }

    const { error } = await db.from("spending_goals").insert({
      id: `goal_${randomUUID()}`,
      space_id: input.spaceId,
      category_id: input.categoryId,
      amount_cents: input.amountCents,
      created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async deleteSpendingGoal(spaceId: string, categoryId: string | null): Promise<void> {
    const db = getSupabaseAdmin();
    let query = db.from("spending_goals").delete().eq("space_id", spaceId);
    query = categoryId ? query.eq("category_id", categoryId) : query.is("category_id", null);
    const { error } = await query;
    if (error) throw new Error(error.message);
  }

  async listAssets(spaceId: string): Promise<Asset[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("assets")
      .select("*")
      .eq("space_id", spaceId)
      .order("created_at");
    if (error) throw new Error(error.message);

    /**
     * A ordem escolhida à mão aplica-se **aqui**, e não no SQL.
     *
     * Ordenar por `sort_order` na consulta parecia mais limpo e apagou o
     * património todo do ecrã: enquanto a migração `0030` não estivesse
     * aplicada, a coluna não existia, o Postgres recusava a consulta inteira, e
     * o `.catch(() => [])` de quem chama transformava isso em "não tens bens
     * nenhuns". Um erro de esquema não pode parecer uma conta vazia.
     *
     * Em JavaScript, uma coluna que ainda não existe é um `undefined` — e
     * `undefined` quer dizer exatamente o que a coluna quer dizer quando é
     * nula: "nunca foi mexido, manda a data de criação".
     */
    const bens = (data ?? []).map(rowToAsset);
    return bens
      .map((a, i) => ({ a, i }))
      .sort((x, y) => {
        const ax = x.a.sortOrder ?? null;
        const ay = y.a.sortOrder ?? null;
        if (ax !== null && ay !== null) return ax - ay || x.i - y.i;
        if (ax !== null) return -1;
        if (ay !== null) return 1;
        return x.i - y.i;
      })
      .map((x) => x.a);
  }

  async listNetWorthSnapshots(spaceId: string): Promise<NetWorthSnapshotRow[]> {
    const db = getSupabaseAdmin();
    // Paginado de propósito: uma fotografia por dia passa as mil linhas ao fim
    // de três anos, e o Supabase corta nas mil sem avisar. Cortado, o gráfico
    // perdia o princípio da série e ninguém percebia porquê.
    const rows = await todasAsLinhas<any>((de, ate) =>
      db
        .from("net_worth_snapshots")
        .select("*")
        .eq("space_id", spaceId)
        .order("on_date")
        .range(de, ate),
    );
    return rows.map(rowToSnapshot);
  }

  async saveNetWorthSnapshot(input: CreateNetWorthSnapshot): Promise<void> {
    const db = getSupabaseAdmin();
    // Uma por dia e por ambiente: a do dia substitui a anterior em vez de
    // acrescentar um ponto sobreposto ao gráfico.
    const { error } = await db.from("net_worth_snapshots").upsert(
      {
        // Determinístico: a fotografia de um dia é sempre a mesma linha. Com um
        // uuid novo a cada gravação, o upsert reescrevia a chave primária todos
        // os dias — funciona, mas deixa de haver forma de apontar para a linha.
        id: `nw_${input.spaceId}_${input.onDate}`,
        space_id: input.spaceId,
        on_date: input.onDate,
        assets_cents: input.assetsCents,
        debts_cents: input.debtsCents,
        net_cents: input.netCents,
        breakdown: input.breakdown ?? null,
      },
      { onConflict: "space_id,on_date" },
    );
    if (error) throw new Error(error.message);
  }

  async listAssetAttachments(spaceId: string, assetId?: string): Promise<AssetAttachment[]> {
    const db = getSupabaseAdmin();
    let q = db.from("asset_attachments").select("*").eq("space_id", spaceId);
    if (assetId) q = q.eq("asset_id", assetId);
    const { data, error } = await q.order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToAttachment);
  }

  async getAssetAttachment(id: string, spaceId: string): Promise<AssetAttachment | null> {
    const db = getSupabaseAdmin();
    // Numa consulta só: ver o comentário na interface.
    const { data, error } = await db
      .from("asset_attachments")
      .select("*")
      .eq("id", id)
      .eq("space_id", spaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? rowToAttachment(data) : null;
  }

  async createAssetAttachment(input: CreateAssetAttachment): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from("asset_attachments").insert({
      id: input.id,
      space_id: input.spaceId,
      asset_id: input.assetId,
      file_name: input.fileName,
      content_type: input.contentType,
      size_bytes: input.sizeBytes,
      storage_path: input.storagePath,
      status: input.status,
      created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async markAssetAttachmentReady(id: string, spaceId: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("asset_attachments")
      .update({ status: "pronto" })
      .eq("id", id)
      .eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  async moveAssetAttachments(
    fromAssetId: string,
    toAssetId: string,
    spaceId: string,
  ): Promise<number> {
    const db = getSupabaseAdmin();
    // O `space_id` filtra a escrita, como em todas as outras: um id vindo de um
    // formulário não é prova de nada. O `select()` devolve as linhas mexidas,
    // que é como se sabe quantas foram — sem ele, contar-se-iam as que se
    // esperava ter mexido, que é outra coisa.
    const { data, error } = await db
      .from("asset_attachments")
      .update({ asset_id: toAssetId })
      .eq("asset_id", fromAssetId)
      .eq("space_id", spaceId)
      .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  }

  async deleteAssetAttachment(id: string, spaceId: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("asset_attachments")
      .delete()
      .eq("id", id)
      .eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  async createAsset(input: CreateAssetInput): Promise<Asset> {
    const db = getSupabaseAdmin();
    const id = `ast_${randomUUID()}`;
    const { data, error } = await db
      .from("assets")
      .insert({
        id,
        space_id: input.spaceId,
        name: input.name,
        kind: input.kind,
        quantity: input.quantity ?? null,
        unit_cost_cents: input.unitCostCents ?? null,
        unit_price_cents: input.unitPriceCents ?? null,
        value_cents: input.valueCents ?? null,
        purchased_at: input.purchasedAt ?? null,
        notes: input.notes ?? null,
        interest_rate_pct: input.interestRatePct ?? null,
        monthly_payment_cents: input.monthlyPaymentCents ?? null,
        term_months: input.termMonths ?? null,
        rate_kind: input.rateKind ?? null,
        maturity_date: input.maturityDate ?? null,
        credit_terms: input.creditTerms ?? null,
        ownership_pct: input.ownershipPct ?? null,
        co_owner_member_id: input.coOwnerMemberId ?? null,
        area_m2: input.areaM2 ?? null,
        location: input.location ?? null,
        price_ref_cents: input.priceRefCents ?? null,
        price_ref_source: input.priceRefSource ?? null,
        price_ref_geocod: input.priceRefGeocod ?? null,
        purchase_price_cents: input.purchasePriceCents ?? null,
        works_cents: input.worksCents ?? null,
        symbol: input.symbol ?? null,
        exchange: input.exchange ?? null,
        logo_domain: input.logoDomain ?? null,
        finances_asset_id: input.financesAssetId ?? null,
        sort_order: input.sortOrder ?? null,
        created_by: input.createdBy ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToAsset(data);
  }

  async updateAsset(id: string, spaceId: string, patch: Partial<CreateAssetInput>): Promise<void> {
    const db = getSupabaseAdmin();
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.kind !== undefined) row.kind = patch.kind;
    if (patch.quantity !== undefined) row.quantity = patch.quantity;
    if (patch.unitCostCents !== undefined) row.unit_cost_cents = patch.unitCostCents;
    if (patch.unitPriceCents !== undefined) row.unit_price_cents = patch.unitPriceCents;
    if (patch.valueCents !== undefined) row.value_cents = patch.valueCents;
    if (patch.purchasedAt !== undefined) row.purchased_at = patch.purchasedAt;
    if (patch.notes !== undefined) row.notes = patch.notes;
    if (patch.interestRatePct !== undefined) row.interest_rate_pct = patch.interestRatePct;
    if (patch.monthlyPaymentCents !== undefined) row.monthly_payment_cents = patch.monthlyPaymentCents;
    if (patch.termMonths !== undefined) row.term_months = patch.termMonths;
    if (patch.rateKind !== undefined) row.rate_kind = patch.rateKind;
    if (patch.maturityDate !== undefined) row.maturity_date = patch.maturityDate;
    if (patch.creditTerms !== undefined) row.credit_terms = patch.creditTerms;
    if (patch.ownershipPct !== undefined) row.ownership_pct = patch.ownershipPct;
    if (patch.coOwnerMemberId !== undefined) row.co_owner_member_id = patch.coOwnerMemberId;
    if (patch.areaM2 !== undefined) row.area_m2 = patch.areaM2;
    if (patch.location !== undefined) row.location = patch.location;
    if (patch.priceRefCents !== undefined) row.price_ref_cents = patch.priceRefCents;
    if (patch.priceRefSource !== undefined) row.price_ref_source = patch.priceRefSource;
    if (patch.priceRefGeocod !== undefined) row.price_ref_geocod = patch.priceRefGeocod;
    if (patch.purchasePriceCents !== undefined) row.purchase_price_cents = patch.purchasePriceCents;
    if (patch.worksCents !== undefined) row.works_cents = patch.worksCents;
    if (patch.symbol !== undefined) row.symbol = patch.symbol;
    if (patch.exchange !== undefined) row.exchange = patch.exchange;
    if (patch.logoDomain !== undefined) row.logo_domain = patch.logoDomain;
    if (patch.financesAssetId !== undefined) row.finances_asset_id = patch.financesAssetId;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    const { error } = await db.from("assets").update(row).eq("id", id).eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  async deleteAsset(id: string, spaceId: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from("assets").delete().eq("id", id).eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  async listAssetTrades(spaceId: string, assetId?: string): Promise<AssetTrade[]> {
    const db = getSupabaseAdmin();
    // Um extrato de corretora traz centenas de linhas de uma vez, e a posição
    // atual sai da soma de todas: cortar aos mil dava uma carteira imaginária.
    const data = await todasAsLinhas<any>((de, ate) => {
      let q = db.from("asset_trades").select("*").eq("space_id", spaceId);
      if (assetId) q = q.eq("asset_id", assetId);
      return q.order("trade_date", { ascending: true }).range(de, ate);
    });
    return data.map(rowToAssetTrade);
  }

  async createAssetTrade(input: CreateAssetTradeInput): Promise<AssetTrade> {
    const db = getSupabaseAdmin();
    const id = `atr_${randomUUID()}`;
    const { data, error } = await db
      .from("asset_trades")
      .insert({
        id,
        space_id: input.spaceId,
        asset_id: input.assetId,
        trade_date: input.date,
        kind: input.kind,
        quantity: input.quantity ?? null,
        unit_price_cents: input.unitPriceCents ?? null,
        amount_cents: input.amountCents,
        currency: input.currency ?? null,
        original_amount_cents: input.originalAmountCents ?? null,
        fx_rate: input.fxRate ?? null,
        notes: input.notes ?? null,
        created_by: input.createdBy ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToAssetTrade(data);
  }

  async deleteAssetTrade(id: string, spaceId: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from("asset_trades").delete().eq("id", id).eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  async updateAssetTrade(
    id: string,
    spaceId: string,
    patch: Partial<CreateAssetTradeInput>,
  ): Promise<void> {
    const db = getSupabaseAdmin();
    const row: Record<string, unknown> = {};
    // `trade_date`, não `date`: a coluna chama-se assim desde a 0016. Escrever
    // o nome errado aqui fazia o PostgREST recusar a escrita inteira, e o ecrã
    // dizia só "Não consegui gravar o movimento" — o erro certo, pela razão
    // errada. O mock não apanha isto, porque guarda objetos e não colunas.
    // `assetId` primeiro, e com razão para estar aqui: sem esta linha, mudar um
    // movimento de investimento era um NÃO-FAZER-NADA silencioso. Nenhum erro,
    // nenhum aviso, e a fusão de dois registos duplicados dizia "movi 12
    // movimentos" com os doze exactamente onde estavam.
    // `assetId` primeiro, e com razão para estar aqui: sem esta linha, mudar um
    // movimento de investimento era um NÃO-FAZER-NADA silencioso. Nenhum erro,
    // nenhum aviso, e a fusão de dois registos duplicados dizia "movi 12
    // movimentos" com os doze exactamente onde estavam.
    if (patch.assetId !== undefined) row.asset_id = patch.assetId;
    if (patch.date !== undefined) row.trade_date = patch.date;
    if (patch.kind !== undefined) row.kind = patch.kind;
    if (patch.quantity !== undefined) row.quantity = patch.quantity;
    if (patch.unitPriceCents !== undefined) row.unit_price_cents = patch.unitPriceCents;
    if (patch.amountCents !== undefined) row.amount_cents = patch.amountCents;
    if (patch.currency !== undefined) row.currency = patch.currency;
    if (patch.originalAmountCents !== undefined) row.original_amount_cents = patch.originalAmountCents;
    if (patch.fxRate !== undefined) row.fx_rate = patch.fxRate;
    if (patch.notes !== undefined) row.notes = patch.notes;
    if (Object.keys(row).length === 0) return;
    // O `space_id` filtra a escrita: ver o comentário na interface.
    const { error } = await db.from("asset_trades").update(row).eq("id", id).eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  /**
   * As cotações de um símbolo, por ordem cronológica.
   *
   * **Lê-se por páginas porque a API do Supabase corta em mil linhas, calada.**
   * Dez anos de fechos diários são mais de dois mil e quinhentos, e sem paginação
   * o que chegava eram os **mil mais antigos**. O efeito era este: o MSFT
   * mostrava o fecho de 28/07/2020 como se fosse o de hoje, com a data certa ao
   * lado, porque a série realmente acabava ali. Um corte silencioso é pior do que
   * um erro, porque o número errado apresenta-se como certo.
   */
  async listQuotes(symbol: string, fromDate?: string): Promise<StoredQuote[]> {
    const db = getSupabaseAdmin();
    const data = await todasAsLinhas<any>((de, ate) => {
      let q = db.from("quotes").select("quote_date, close_cents").eq("symbol", symbol);
      if (fromDate) q = q.gte("quote_date", fromDate);
      return q.order("quote_date", { ascending: true }).range(de, ate);
    });
    return data.map((r: any) => ({
      date: String(r.quote_date).slice(0, 10),
      closeCents: Number(r.close_cents),
    }));
  }

  /**
   * Só o último fecho.
   *
   * Existe para quem quer o preço de agora e não a série: atualizar o valor de um
   * investimento não precisa de dez anos de histórico a atravessar a rede.
   */
  async latestQuote(symbol: string): Promise<StoredQuote | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("quotes")
      .select("quote_date, close_cents")
      .eq("symbol", symbol)
      .order("quote_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      date: String((data as any).quote_date).slice(0, 10),
      closeCents: Number((data as any).close_cents),
    };
  }

  async quoteCurrency(symbol: string): Promise<string | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("quotes")
      .select("currency")
      .eq("symbol", symbol)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.currency as string | undefined) ?? null;
  }

  async saveQuotes(symbol: string, quotes: StoredQuote[], currency: string): Promise<void> {
    if (quotes.length === 0) return;
    const db = getSupabaseAdmin();
    // A chave é (símbolo, dia): reescrever o mesmo dia é idempotente, e é o que
    // permite ir buscar séries que se sobrepõem sem pensar no assunto.
    const rows = quotes.map((q) => ({
      symbol,
      quote_date: q.date,
      close_cents: q.closeCents,
      currency,
      fetched_at: new Date().toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db
        .from("quotes")
        .upsert(rows.slice(i, i + 500), { onConflict: "symbol,quote_date" });
      if (error) throw new Error(error.message);
    }
  }

  async listAllAssetSymbols(): Promise<string[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("assets").select("symbol").not("symbol", "is", null);
    if (error) throw new Error(error.message);
    return [...new Set((data ?? []).map((r: any) => r.symbol).filter(Boolean))];
  }

  async latestQuoteDate(symbol: string): Promise<string | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("quotes")
      .select("quote_date")
      .eq("symbol", symbol)
      .order("quote_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? String(data.quote_date).slice(0, 10) : null;
  }

  async unlinkUserFromMembers(userId: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("members")
      .update({ linked_user_id: null })
      .eq("linked_user_id", userId);
    if (error) throw new Error(error.message);
  }

  async deleteAccountAndSoleSpaces(userId: string): Promise<void> {
    const db = getSupabaseAdmin();

    const { data: mine, error } = await db
      .from("members")
      .select("space_id")
      .eq("linked_user_id", userId);
    if (error) throw new Error(error.message);

    // Só se apagam ambientes onde esta pessoa estava sozinha: os partilhados
    // pertencem também a quem lá ficou.
    const spaceIds = [...new Set((mine ?? []).map((m: any) => m.space_id as string))];
    for (const spaceId of spaceIds) {
      const { count } = await db
        .from("members")
        .select("id", { count: "exact", head: true })
        .eq("space_id", spaceId);
      if ((count ?? 0) <= 1) {
        // As tabelas dependentes caem por "on delete cascade".
        await db.from("spaces").delete().eq("id", spaceId);
      }
    }

    await this.unlinkUserFromMembers(userId);
    await db.from("password_reset_tokens").delete().eq("user_id", userId);
    await db.from("app_users").delete().eq("id", userId);
  }

  async createPasswordResetToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from("password_reset_tokens").insert({
      id: `prt_${randomUUID()}`,
      user_id: input.userId,
      token_hash: input.tokenHash,
      expires_at: input.expiresAt,
    });
    if (error) throw new Error(error.message);
  }

  async consumePasswordResetToken(tokenHash: string): Promise<{ userId: string } | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("password_reset_tokens")
      .select("id, user_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.used_at || new Date(data.expires_at as string) < new Date()) return null;

    // Marca-se como usado ANTES de devolver: um token só serve uma vez, mesmo
    // que dois pedidos cheguem ao mesmo tempo.
    const { error: e2 } = await db
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", data.id as string)
      .is("used_at", null);
    if (e2) throw new Error(e2.message);

    return { userId: data.user_id as string };
  }

  async listIncome(spaceId: string): Promise<Income[]> {
    const db = getSupabaseAdmin();
    const data = await todasAsLinhas<any>((de, ate) =>
      db
        .from("income")
        .select("*")
        .eq("space_id", spaceId)
        .order("date", { ascending: false })
        .range(de, ate),
    );
    return data.map((r: any) => ({
      id: r.id,
      spaceId: r.space_id,
      kind: r.kind,
      description: r.description,
      amountCents: r.amount_cents,
      date: r.date,
      recurring: Boolean(r.recurring),
      notes: r.notes ?? null,
    }));
  }

  async createIncome(input: CreateIncomeInput): Promise<Income> {
    const db = getSupabaseAdmin();
    const id = `inc_${randomUUID()}`;
    const { error } = await db.from("income").insert({
      id,
      space_id: input.spaceId,
      kind: input.kind,
      description: input.description,
      amount_cents: input.amountCents,
      date: input.date,
      recurring: input.recurring,
      notes: input.notes ?? null,
      created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(error.message);
    return { ...input, id };
  }

  async deleteIncome(id: string, spaceId: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from("income").delete().eq("id", id).eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  async listExpenseUids(spaceId: string): Promise<{ id: string; uid: string }[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("expenses")
      .select("id, uid")
      .eq("space_id", spaceId)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({ id: r.id, uid: r.uid }));
  }

  async createImportBatch(input: CreateImportBatchInput): Promise<ImportBatch> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("import_batches")
      .insert({
        id: `imp_${randomUUID()}`,
        space_id: input.spaceId,
        source: input.source,
        file_name: input.fileName ?? null,
        row_count: input.rowCount,
        imported_count: input.importedCount,
        duplicate_count: input.duplicateCount,
        ...(input.lastTransactionDate
          ? { last_transaction_date: input.lastTransactionDate }
          : {}),
        created_by: input.createdBy ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToImportBatch(data);
  }

  async listImportBatches(spaceId: string): Promise<ImportBatch[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("import_batches")
      .select("*")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToImportBatch);
  }

  async undoImportBatch(batchId: string, spaceId: string, _userId: string): Promise<number> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("expenses")
      .update({ deleted_at: new Date().toISOString() })
      .eq("import_batch_id", batchId)
      .eq("space_id", spaceId)
      .is("deleted_at", null)
      .select("id");
    if (error) throw new Error(error.message);

    const { error: e2 } = await db
      .from("import_batches")
      .delete()
      .eq("id", batchId)
      .eq("space_id", spaceId);
    if (e2) throw new Error(e2.message);

    return (data ?? []).length;
  }

  async countPendingApprovals(spaceId: string): Promise<number> {
    const db = getSupabaseAdmin();
    const { count, error } = await db
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("space_id", spaceId)
      .eq("approval_status", "pending")
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    return count ?? 0;
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

  // ---- Desdobramentos ---------------------------------------------------

  async listAssetSplits(spaceId: string, assetId?: string): Promise<StoredAssetSplit[]> {
    const db = getSupabaseAdmin();
    const rows = await todasAsLinhas<any>((de, ate) => {
      let q = db.from("asset_splits").select("*").eq("space_id", spaceId);
      if (assetId) q = q.eq("asset_id", assetId);
      return q.order("split_date").range(de, ate);
    });
    return rows.map(rowToSplit);
  }

  async createAssetSplit(input: CreateAssetSplitInput): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from("asset_splits").insert({
      id: `spl_${randomUUID()}`,
      space_id: input.spaceId,
      asset_id: input.assetId,
      split_date: input.date,
      ratio: input.ratio,
      notes: input.notes ?? null,
      created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async deleteAssetSplit(id: string, spaceId: string): Promise<void> {
    const db = getSupabaseAdmin();
    // O ambiente filtra a escrita: um id vindo do formulário não é prova de nada.
    const { error } = await db
      .from("asset_splits")
      .delete()
      .eq("id", id)
      .eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  // ---- Avaliações -------------------------------------------------------

  async listValuations(spaceId: string): Promise<StoredValuation[]> {
    const db = getSupabaseAdmin();
    // Paginado como tudo o que pode crescer: o PostgREST corta nas 1000 linhas
    // sem avisar, e uma lista cortada em silêncio lê-se como uma lista completa.
    const rows = await todasAsLinhas<any>((de, ate) =>
      db
        .from("valuations")
        .select("*")
        .eq("space_id", spaceId)
        .order("study_date", { ascending: false })
        .range(de, ate),
    );
    return rows.map(rowToValuation);
  }

  async createValuation(input: CreateValuationInput): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from("valuations").insert({
      id: `val_${randomUUID()}`,
      space_id: input.spaceId,
      symbol: input.symbol,
      name: input.name,
      stage: input.stage,
      study_date: input.studyDate,
      fcf_cents: input.fcfCents,
      shares: input.shares,
      net_debt_cents: input.netDebtCents,
      discount_pct: input.discountPct,
      perpetual_pct: input.perpetualPct,
      years: input.years,
      margin_pct: input.marginPct,
      scenarios: input.scenarios,
      weighted_price_cents: input.weightedPriceCents,
      price_at_study_cents: input.priceAtStudyCents,
      upside_pct: input.upsidePct,
      notes: input.notes,
      created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async updateValuationStage(id: string, spaceId: string, stage: EtapaAvaliacao): Promise<void> {
    const db = getSupabaseAdmin();
    // O ambiente filtra a escrita: um id vindo do formulário não é prova de nada.
    const { error } = await db
      .from("valuations")
      .update({ stage, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  async deleteValuation(id: string, spaceId: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from("valuations").delete().eq("id", id).eq("space_id", spaceId);
    if (error) throw new Error(error.message);
  }

  // ---- Pedidos de ajuda -------------------------------------------------
  //
  // A separação entre o que o utilizador lê e as notas internas é feita por
  // DUAS funções com nomes diferentes, e não por uma bandeira. Ver o
  // comentário na interface: uma bandeira é igual a isto até ao dia em que
  // alguém a passa ao contrário, e aí a nota já foi lida.

  async createTicket(input: CreateTicketInput): Promise<string> {
    const db = getSupabaseAdmin();
    const id = `tkt_${randomUUID()}`;
    const { error } = await db.from("tickets").insert({
      id,
      space_id: input.spaceId,
      created_by: input.createdBy,
      subject: input.subject,
      status: "novo",
    });
    if (error) throw new Error(error.message);

    // A primeira mensagem é o corpo do pedido, e é pública por definição: foi
    // a pessoa que a escreveu.
    const { error: e2 } = await db.from("ticket_messages").insert({
      id: `tkm_${randomUUID()}`,
      ticket_id: id,
      author_id: input.createdBy,
      body: input.body,
      internal: false,
    });
    if (e2) throw new Error(e2.message);
    return id;
  }

  async listTicketsDoUtilizador(userId: string): Promise<Ticket[]> {
    const db = getSupabaseAdmin();
    const rows = await todasAsLinhas<any>((de, ate) =>
      db
        .from("tickets")
        .select("*")
        .eq("created_by", userId)
        .order("updated_at", { ascending: false })
        .range(de, ate),
    );
    return rows.map(rowToTicket);
  }

  async listTicketsTodos(): Promise<Ticket[]> {
    const db = getSupabaseAdmin();
    const rows = await todasAsLinhas<any>((de, ate) =>
      db.from("tickets").select("*").order("updated_at", { ascending: false }).range(de, ate),
    );
    return rows.map(rowToTicket);
  }

  async getTicketDoUtilizador(id: string, userId: string): Promise<Ticket | null> {
    const db = getSupabaseAdmin();
    // O autor vai na consulta, não numa comparação em JS depois de ler.
    const { data, error } = await db
      .from("tickets")
      .select("*")
      .eq("id", id)
      .eq("created_by", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? rowToTicket(data) : null;
  }

  async getTicket(id: string): Promise<Ticket | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("tickets").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? rowToTicket(data) : null;
  }

  async listTicketMessagesPublicas(ticketId: string): Promise<TicketMessage[]> {
    const db = getSupabaseAdmin();
    const rows = await todasAsLinhas<any>((de, ate) =>
      db
        .from("ticket_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        // O filtro está AQUI, na consulta. As internas nem chegam a sair da
        // base de dados por este caminho.
        .eq("internal", false)
        .order("created_at")
        .range(de, ate),
    );
    return rows.map(rowToTicketMessage);
  }

  async listTicketMessagesTodas(ticketId: string): Promise<TicketMessage[]> {
    const db = getSupabaseAdmin();
    const rows = await todasAsLinhas<any>((de, ate) =>
      db
        .from("ticket_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at")
        .range(de, ate),
    );
    return rows.map(rowToTicketMessage);
  }

  async addTicketMessage(input: CreateTicketMessageInput): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from("ticket_messages").insert({
      id: `tkm_${randomUUID()}`,
      ticket_id: input.ticketId,
      author_id: input.authorId,
      body: input.body,
      internal: input.internal,
    });
    if (error) throw new Error(error.message);

    // Uma nota interna NÃO mexe no `updated_at`: se mexesse, o fio do
    // utilizador passava a denunciar a hora a que alguém escreveu uma coisa
    // que ele não pode ler.
    if (!input.internal) {
      await db
        .from("tickets")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", input.ticketId);
    }
  }

  async setTicketStatus(id: string, status: TicketStatus): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("tickets")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async countTicketsAbertos(): Promise<number> {
    const db = getSupabaseAdmin();
    const { count, error } = await db
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .in("status", ["novo", "a-tratar", "a-aguardar"]);
    if (error) throw new Error(error.message);
    return count ?? 0;
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
      archivedAt: r.archived_at ?? null,
      notes: r.notes ?? null,
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

  async setContactMessageArchived(id: string, archived: boolean): Promise<void> {
    const db = getSupabaseAdmin();
    const patch: Record<string, unknown> = {
      archived_at: archived ? new Date().toISOString() : null,
    };
    // Arquivar implica lida.
    if (archived) patch.read_at = new Date().toISOString();
    const { error } = await db.from("contact_messages").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async setContactMessageNotes(id: string, notes: string | null): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("contact_messages")
      .update({ notes })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async countUnreadContactMessages(): Promise<number> {
    const db = getSupabaseAdmin();
    const { count, error } = await db
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .is("archived_at", null);
    if (!error) return count ?? 0;

    // Tolerante: se a coluna archived_at ainda não existir (migração por aplicar),
    // conta apenas por ler para não partir o cabeçalho da app.
    const fallback = await db
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    return fallback.count ?? 0;
  }
}

function rowToAssetTrade(r: any): AssetTrade {
  return {
    id: r.id,
    spaceId: r.space_id,
    assetId: r.asset_id,
    date: String(r.trade_date).slice(0, 10),
    kind: r.kind,
    quantity: r.quantity === null || r.quantity === undefined ? null : Number(r.quantity),
    unitPriceCents: r.unit_price_cents ?? null,
    amountCents: Number(r.amount_cents ?? 0),
    currency: r.currency ?? null,
    originalAmountCents: r.original_amount_cents ?? null,
    fxRate: r.fx_rate === null || r.fx_rate === undefined ? null : Number(r.fx_rate),
    notes: r.notes ?? null,
    createdAt: r.created_at ?? null,
  };
}

function rowToSplit(r: any): StoredAssetSplit {
  return {
    id: r.id,
    spaceId: r.space_id,
    assetId: r.asset_id,
    date: String(r.split_date).slice(0, 10),
    // `numeric` chega como texto do PostgREST: sem o Number, o fator entrava
    // nas contas como string e "5" * "20" dava NaN em metade dos sítios.
    ratio: Number(r.ratio),
    notes: r.notes ?? null,
    createdAt: r.created_at ?? null,
  };
}

function rowToValuation(r: any): StoredValuation {
  return {
    id: r.id,
    spaceId: r.space_id,
    symbol: r.symbol ?? null,
    name: r.name,
    stage: r.stage as EtapaAvaliacao,
    studyDate: String(r.study_date).slice(0, 10),
    // `numeric` e `bigint` chegam como texto do PostgREST. Sem o `Number`, uma
    // taxa de desconto entrava nas contas como string e o DCF devolvia NaN.
    fcfCents: Number(r.fcf_cents),
    shares: Number(r.shares),
    netDebtCents: Number(r.net_debt_cents),
    discountPct: Number(r.discount_pct),
    perpetualPct: Number(r.perpetual_pct),
    years: Number(r.years),
    marginPct: Number(r.margin_pct),
    // Validado campo a campo. Ver `lerCenarios`.
    scenarios: lerCenarios(r.scenarios),
    weightedPriceCents: Number(r.weighted_price_cents),
    priceAtStudyCents: r.price_at_study_cents === null || r.price_at_study_cents === undefined
      ? null
      : Number(r.price_at_study_cents),
    upsidePct: r.upside_pct === null || r.upside_pct === undefined ? null : Number(r.upside_pct),
    notes: r.notes ?? null,
    createdAt: r.created_at ?? null,
  };
}

function rowToTicket(r: any): Ticket {
  return {
    id: r.id,
    spaceId: r.space_id,
    createdBy: r.created_by,
    subject: r.subject,
    status: isTicketStatus(r.status) ? r.status : "novo",
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
  };
}

function rowToTicketMessage(r: any): TicketMessage {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    authorId: r.author_id,
    body: r.body ?? "",
    // `=== true` e não `Boolean(...)`: um valor guardado por uma versão antiga
    // chega como `null`, e o lado seguro de um `null` aqui é "não é interna" —
    // que é o que a coluna diz por omissão.
    internal: r.internal === true,
    createdAt: r.created_at,
  };
}

function rowToAttachment(r: any): AssetAttachment {
  return {
    id: r.id,
    spaceId: r.space_id,
    assetId: r.asset_id,
    fileName: r.file_name,
    contentType: r.content_type,
    sizeBytes: Number(r.size_bytes ?? 0),
    storagePath: r.storage_path,
    status: r.status === "pronto" ? "pronto" : "a-enviar",
    createdBy: r.created_by ?? null,
    createdAt: r.created_at ?? null,
  };
}

function rowToSnapshot(r: any): NetWorthSnapshotRow {
  return {
    id: r.id,
    spaceId: r.space_id,
    onDate: String(r.on_date ?? "").slice(0, 10),
    assetsCents: Number(r.assets_cents ?? 0),
    debtsCents: Number(r.debts_cents ?? 0),
    netCents: Number(r.net_cents ?? 0),
    // Cru de propósito: quem lê valida. Ver o comentário do `creditTerms`.
    breakdown: r.breakdown ?? null,
  };
}

function rowToAsset(r: any): Asset {
  return {
    id: r.id,
    spaceId: r.space_id,
    name: r.name,
    kind: r.kind,
    quantity: r.quantity === null ? null : Number(r.quantity),
    unitCostCents: r.unit_cost_cents ?? null,
    unitPriceCents: r.unit_price_cents ?? null,
    valueCents: r.value_cents ?? null,
    purchasedAt: r.purchased_at ?? null,
    notes: r.notes ?? null,
    interestRatePct: r.interest_rate_pct === null || r.interest_rate_pct === undefined ? null : Number(r.interest_rate_pct),
    monthlyPaymentCents: r.monthly_payment_cents ?? null,
    termMonths: r.term_months ?? null,
    rateKind: r.rate_kind ?? null,
    maturityDate: r.maturity_date ?? null,
    // Cru de propósito: quem lê valida com `parseCreditTerms`.
    creditTerms: r.credit_terms ?? null,
    ownershipPct:
      r.ownership_pct === null || r.ownership_pct === undefined ? null : Number(r.ownership_pct),
    coOwnerMemberId: r.co_owner_member_id ?? null,
    areaM2: r.area_m2 === null || r.area_m2 === undefined ? null : Number(r.area_m2),
    location: r.location ?? null,
    priceRefCents: r.price_ref_cents ?? null,
    priceRefSource: r.price_ref_source ?? null,
    priceRefGeocod: r.price_ref_geocod ?? null,
    purchasePriceCents: r.purchase_price_cents ?? null,
    worksCents: r.works_cents ?? null,
    symbol: r.symbol ?? null,
    exchange: r.exchange ?? null,
    logoDomain: r.logo_domain ?? null,
    financesAssetId: r.finances_asset_id ?? null,
    sortOrder: r.sort_order === null || r.sort_order === undefined ? null : Number(r.sort_order),
    updatedAt: r.updated_at ?? null,
  };
}
