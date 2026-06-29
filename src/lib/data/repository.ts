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

export interface ContactMessage {
  id: string;
  name?: string | null;
  email: string;
  message: string;
  createdAt: string;
  readAt?: string | null;
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

  listExpenses(filters: ExpenseFilters): Promise<Expense[]>;
  getExpense(id: string, viewerId: string): Promise<Expense | null>;
  createExpense(input: CreateExpenseInput): Promise<Expense>;
  softDeleteExpense(id: string, actorId: string): Promise<void>;

  listSettlements(spaceId: string): Promise<Settlement[]>;
  createSettlement(input: CreateSettlementInput): Promise<Settlement>;

  listCategories(): Promise<Category[]>;
  listClassificationRules(): Promise<ClassificationRule[]>;

  // Palavra-chave (login interim).
  getUserPasswordHash(userId: string): Promise<string | null>;
  setUserPasswordHash(userId: string, hash: string): Promise<void>;

  // Mensagens de contacto da landing.
  createContactMessage(input: CreateContactInput): Promise<void>;
  listContactMessages(): Promise<ContactMessage[]>;
  markContactMessageRead(id: string): Promise<void>;
}
