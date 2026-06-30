/**
 * Camada de dados — interface do repositório.
 *
 * A app fala sempre com esta interface; existem duas implementações:
 *  - MockRepository: em memória, com seed (app navegável sem Supabase).
 *  - SupabaseRepository: Postgres do Supabase (produção).
 *
 * Escolha em runtime via `getRepository()` (ver index.ts) conforme a config.
 */

import type {
  Currency,
  Expense,
  ExpenseKind,
  ExpenseOrigin,
  ExpenseStatus,
  Settlement,
  Split,
  ClassificationRule,
} from "@/lib/domain";

export interface Category {
  id: string;
  name: string;
  color: string;
  icon?: string;
  /** null = categoria padrão (disponível em todos os ambientes). */
  spaceId?: string | null;
}

export interface CreateCategoryInput {
  spaceId: string;
  name: string;
  color: string;
  icon?: string | null;
}

export interface UpdateCategoryInput {
  name?: string;
  color?: string;
  icon?: string | null;
}

export interface Space {
  id: string;
  name: string;
  createdBy?: string | null;
  createdAt: string;
}

export interface Member {
  id: string;
  spaceId: string;
  name: string;
  linkedUserId?: string | null;
  email?: string | null;
}

export interface CreateSpaceInput {
  name: string;
  createdBy: string;
  /** Participantes iniciais (o criador é incluído automaticamente). */
  members: { name: string; email?: string | null; linkedUserId?: string | null }[];
}

export interface AddMemberInput {
  spaceId: string;
  name: string;
  email?: string | null;
  linkedUserId?: string | null;
}

export interface UpdateMemberInput {
  name?: string;
  email?: string | null;
}

export interface ContactMessage {
  id: string;
  name?: string | null;
  email: string;
  message: string;
  createdAt: string;
  readAt?: string | null;
  archivedAt?: string | null;
  notes?: string | null;
}

export interface CreateContactInput {
  name?: string | null;
  email: string;
  message: string;
}

export interface ExpenseFilters {
  /** Ambiente (space) a consultar. */
  spaceId: string;
  /** Participante (member) que faz o pedido, p/ privacidade das pessoais. */
  viewerId: string;
  from?: string;
  to?: string;
  categoryId?: string;
  payerId?: string;
  kind?: ExpenseKind;
  /** Pesquisa de texto na descrição. */
  query?: string;
  includeDeleted?: boolean;
}

export interface CreateExpenseInput {
  spaceId: string;
  description: string;
  amountCents: number;
  currency: Currency;
  transactionDate: string;
  postedDate?: string | null;
  categoryId?: string | null;
  payerId: string;
  kind: ExpenseKind;
  split: Split;
  origin: ExpenseOrigin;
  status?: ExpenseStatus;
  ownerId: string;
  visibleToPartner?: boolean;
  createdBy: string;
}

export interface UpdateExpenseInput {
  description: string;
  amountCents: number;
  transactionDate: string;
  categoryId?: string | null;
  payerId: string;
  kind: ExpenseKind;
  split: Split;
  ownerId: string;
  visibleToPartner?: boolean;
}

export interface CreateSettlementInput {
  spaceId: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  currency: Currency;
  date: string;
  note?: string | null;
  createdBy: string;
}

export interface Repository {
  // Ambientes (spaces) e participantes (members).
  listSpacesForUser(userId: string): Promise<Space[]>;
  getSpace(spaceId: string): Promise<Space | null>;
  createSpace(input: CreateSpaceInput): Promise<Space>;
  listMembers(spaceId: string): Promise<Member[]>;
  addMember(input: AddMemberInput): Promise<Member>;
  updateMember(id: string, spaceId: string, patch: UpdateMemberInput): Promise<void>;
  deleteMember(id: string, spaceId: string): Promise<void>;
  /** Nº de despesas/acertos (não eliminados) que referenciam este participante. */
  countMemberActivity(memberId: string): Promise<number>;

  listExpenses(filters: ExpenseFilters): Promise<Expense[]>;
  getExpense(id: string, viewerId: string): Promise<Expense | null>;
  createExpense(input: CreateExpenseInput): Promise<Expense>;
  updateExpense(id: string, input: UpdateExpenseInput): Promise<void>;
  setReceiptPath(id: string, path: string | null): Promise<void>;
  softDeleteExpense(id: string, actorId: string): Promise<void>;

  listSettlements(spaceId: string): Promise<Settlement[]>;
  createSettlement(input: CreateSettlementInput): Promise<Settlement>;

  /** Categorias disponíveis: padrão (space_id null) + as do ambiente indicado. */
  listCategories(spaceId?: string): Promise<Category[]>;
  createCategory(input: CreateCategoryInput): Promise<Category>;
  updateCategory(id: string, spaceId: string, patch: UpdateCategoryInput): Promise<void>;
  deleteCategory(id: string, spaceId: string): Promise<void>;
  listClassificationRules(): Promise<ClassificationRule[]>;

  // Palavra-chave (login interim).
  getUserPasswordHash(userId: string): Promise<string | null>;
  setUserPasswordHash(userId: string, hash: string): Promise<void>;

  // Mensagens de contacto da landing.
  createContactMessage(input: CreateContactInput): Promise<void>;
  listContactMessages(): Promise<ContactMessage[]>;
  markContactMessageRead(id: string): Promise<void>;
  setContactMessageArchived(id: string, archived: boolean): Promise<void>;
  setContactMessageNotes(id: string, notes: string | null): Promise<void>;
  countUnreadContactMessages(): Promise<number>;
}
