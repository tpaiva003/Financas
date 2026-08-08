/**
 * Camada de dados, interface do repositório.
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
  Membership,
  AssetKind,
  IncomeKind,
  SpacePlan,
} from "@/lib/domain";

export type { Membership };

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

export type RecurringFrequency = "weekly" | "monthly" | "yearly";
export type RecurringValueType = "fixed" | "variable";
export type RecurringStatus = "active" | "paused";

export interface RecurringTemplate {
  id: string;
  spaceId: string;
  description: string;
  categoryId?: string | null;
  payerId: string;
  kind: ExpenseKind;
  split: Split;
  /** Valor fixo (cêntimos). null = variável sem estimativa. */
  amountCents?: number | null;
  valueType: RecurringValueType;
  frequency: RecurringFrequency;
  nextDate: string;
  endDate?: string | null;
  status: RecurringStatus;
  createdBy?: string | null;
  createdAt: string;
}

export interface CreateRecurringInput {
  spaceId: string;
  description: string;
  categoryId?: string | null;
  payerId: string;
  kind: ExpenseKind;
  split: Split;
  amountCents?: number | null;
  valueType: RecurringValueType;
  frequency: RecurringFrequency;
  nextDate: string;
  endDate?: string | null;
  createdBy?: string | null;
}

export interface UpdateRecurringInput {
  description?: string;
  categoryId?: string | null;
  payerId?: string;
  split?: Split;
  amountCents?: number | null;
  valueType?: RecurringValueType;
  frequency?: RecurringFrequency;
  nextDate?: string;
  endDate?: string | null;
  status?: RecurringStatus;
}

export interface ImportBatch {
  id: string;
  lastTransactionDate?: string | null;
  spaceId: string;
  source: string;
  fileName?: string | null;
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  createdBy?: string | null;
  createdAt: string;
}

export interface CreateImportBatchInput {
  /** Data da transação mais recente do lote: base para o próximo import. */
  lastTransactionDate?: string | null;
  spaceId: string;
  source: string;
  fileName?: string | null;
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  createdBy?: string | null;
}

/** Estrutura de banco já confirmada por alguém, reutilizável por todos. */
export interface ImportTemplate {
  id: string;
  fingerprint: string;
  label: string;
  header: string[];
  /** ColumnMapping serializado. */
  mapping: Record<string, number | boolean>;
  uses: number;
  createdBy?: string | null;
  createdAt: string;
}

export type ReminderFrequency = "weekly" | "monthly" | "quarterly";

export interface ImportReminder {
  id: string;
  spaceId: string;
  source: string;
  label?: string | null;
  frequency: ReminderFrequency;
  active: boolean;
  createdAt: string;
}

/** Bem, investimento ou dívida do património de um ambiente. */
export interface Asset {
  id: string;
  spaceId: string;
  name: string;
  kind: AssetKind;
  quantity?: number | null;
  unitCostCents?: number | null;
  unitPriceCents?: number | null;
  valueCents?: number | null;
  purchasedAt?: string | null;
  notes?: string | null;
  /** Taxa anual, em percentagem (juros a receber, ou a pagar numa dívida). */
  interestRatePct?: number | null;
  /** Prestação mensal, para dívidas com plano de amortização. */
  monthlyPaymentCents?: number | null;
  /** Meses que faltam pagar. */
  termMonths?: number | null;
  /** "fixa" ou "variavel". */
  rateKind?: string | null;
  /** Crédito: data do último pagamento. Não envelhece, ao contrário de `termMonths`. */
  maturityDate?: string | null;
  /**
   * Crédito com períodos de taxa (habitação): `{ periods, indexanteRates }`.
   *
   * Vem de uma coluna `jsonb`, por isso chega aqui como `unknown` de propósito.
   * Ler **sempre** com `parseCreditTerms` — o que está guardado pode ter sido
   * escrito por outra versão da app, e um plano de amortização feito sobre um
   * objeto por validar é um número a sério com origem duvidosa.
   */
  creditTerms?: unknown;
  /** Símbolo na fonte de cotações (ex.: "vwce.de"). Sem ele, o preço é manual. */
  symbol?: string | null;
  updatedAt?: string | null;
}

export type CreateAssetInput = Omit<Asset, "id" | "updatedAt"> & { createdBy?: string | null };

/**
 * Um movimento datado de um investimento: compra, venda, dividendo ou custo.
 *
 * `amountCents` é sempre em euros, que é o dinheiro que saiu mesmo da conta.
 * Quando a operação foi noutra moeda, guarda-se também o valor original e a
 * taxa, para o registo ficar auditável sem obrigar a refazer contas.
 */
export interface AssetTrade {
  id: string;
  spaceId: string;
  assetId: string;
  /** "AAAA-MM-DD". */
  date: string;
  kind: "compra" | "venda" | "dividendo" | "custo";
  quantity?: number | null;
  unitPriceCents?: number | null;
  amountCents: number;
  /** Moeda original, quando não foi euro. */
  currency?: string | null;
  originalAmountCents?: number | null;
  /** Unidades da moeda original por euro. */
  fxRate?: number | null;
  notes?: string | null;
  createdAt?: string | null;
}

export type CreateAssetTradeInput = Omit<AssetTrade, "id" | "createdAt"> & {
  createdBy?: string | null;
};

/** Uma cotação guardada. Facto público: não pertence a nenhum ambiente. */
export interface StoredQuote {
  /** "AAAA-MM-DD". */
  date: string;
  closeCents: number;
}

/** Dinheiro que entra: ordenado, trabalhos paralelos, juros, dividendos. */
export interface Income {
  id: string;
  spaceId: string;
  kind: IncomeKind;
  description: string;
  /** Valor líquido recebido. */
  amountCents: number;
  date: string;
  recurring: boolean;
  notes?: string | null;
}

export type CreateIncomeInput = Omit<Income, "id"> & { createdBy?: string | null };

/** Tecto mensal de despesa. `categoryId` nulo = meta do ambiente inteiro. */
export interface SpendingGoal {
  id: string;
  spaceId: string;
  categoryId: string | null;
  amountCents: number;
  createdAt: string;
}

export interface Space {
  id: string;
  name: string;
  /**
   * `free` tem tectos, `full` não tem. Ver `domain/limits.ts`.
   *
   * Fica no ambiente e não na pessoa: é o que se pode medir, e não muda quando
   * alguém entra ou sai.
   */
  plan?: SpacePlan;
  /** Ordem escolhida pelo utilizador (menor primeiro). */
  position?: number;
  createdBy?: string | null;
  createdAt: string;
}

export type MemberRole = "full" | "submitter";

export interface Member {
  id: string;
  spaceId: string;
  name: string;
  linkedUserId?: string | null;
  email?: string | null;
  /** "full" participa no saldo; "submitter" só submete (com aprovação). */
  role?: MemberRole;
  /**
   * Desde quando divide despesas em partes iguais ("AAAA-MM-DD").
   * `null` = desde sempre, que é o que vale para quem já cá estava.
   */
  participatesFrom?: string | null;
}

export interface AppUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Retrato de um ambiente para a consola do dono da plataforma.
 *
 * De propósito, só números e datas: nem descrições, nem valores, nem nomes de
 * despesas. A consola serve para gerir a plataforma, não para ler as contas de
 * quem a usa.
 */
export interface SpaceSummary {
  id: string;
  name: string;
  memberCount: number;
  expenseCount: number;
  /** Data da despesa mais recente (não o seu conteúdo). */
  lastActivity: string | null;
  createdAt: string;
  /** Que funcionalidades este ambiente usa, por id. Só isso, nunca o conteúdo. */
  features: string[];
}

/**
 * Quanto é que cada parte da app é usada.
 *
 * A consola só contava despesas, e com isso não se sabia se alguém chegou a
 * usar o património, os rendimentos ou as recorrentes. Uma funcionalidade que
 * ninguém usa é uma funcionalidade a manter por nada, e sem esta medida não há
 * forma de saber qual é.
 *
 * Continua a valer a regra da consola: contagens, nunca conteúdo.
 */
export interface FeatureUsage {
  id: string;
  label: string;
  /** Em quantos ambientes se usa. */
  spaces: number;
  /** Quantos registos ao todo. */
  records: number;
}

export interface PlatformStats {
  /** Null quando a contagem não pôde ser lida (ver `warnings`). */
  accountCount: number | null;
  spaceCount: number | null;
  expenseCount: number | null;
  /** Ambientes com movimento nos últimos 30 dias. */
  activeSpaces: number | null;
  spaces: SpaceSummary[];
  /** Formatos de banco aprendidos e quantas vezes já serviram. */
  templates: { label: string; uses: number }[];
  /** Que partes da app são usadas, e por quantos ambientes. */
  features: FeatureUsage[];
  /**
   * O que não foi possível ler, em texto. A consola mostra o resto na mesma:
   * um número em falta não pode deitar abaixo a página inteira.
   */
  warnings: string[];
}

export interface CreateSpaceInput {
  name: string;
  createdBy: string;
  /** Omitido = `free`. Quem cria decide, e a base de dados não adivinha. */
  plan?: SpacePlan;
  /** Participantes iniciais (o criador é incluído automaticamente). */
  members: { name: string; email?: string | null; linkedUserId?: string | null }[];
}

export interface AddMemberInput {
  spaceId: string;
  name: string;
  email?: string | null;
  linkedUserId?: string | null;
  /** Ver `Member.participatesFrom`. Ausente = desde sempre. */
  participatesFrom?: string | null;
}

export interface UpdateMemberInput {
  name?: string;
  email?: string | null;
  role?: MemberRole;
  linkedUserId?: string | null;
  participatesFrom?: string | null;
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
  /**
   * UID de deduplicação explícito. O import passa o UID calculado a partir da
   * transação do extrato (com fonte/conta), para que reimportar o mesmo ficheiro
   * seja detetado como duplicado. Sem isto, é derivado dos campos da despesa.
   */
  uid?: string;
  /** Lote de importação que originou esta despesa (permite anular o lote). */
  importBatchId?: string | null;
  /** Template recorrente que originou esta despesa (idempotência). */
  recurringId?: string | null;
  /** Aprovação (despesas submetidas por um "submitter"). */
  approvalStatus?: "pending" | "rejected" | null;
  approverId?: string | null;
  submittedBy?: string | null;
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
  /**
   * Quantos existem neste ambiente. **Só para aplicar tectos** — conta linhas,
   * nunca devolve conteúdo, por isso não precisa de saber quem está a ver.
   */
  countInSpace(spaceId: string, what: "expenses" | "assets" | "members"): Promise<number>;
  createSpace(input: CreateSpaceInput): Promise<Space>;
  /** Muda o nome de um ambiente. */
  renameSpace(spaceId: string, name: string): Promise<void>;
  /** Guarda a ordem escolhida pelo utilizador (índice na lista dada). */
  reorderSpaces(spaceIds: string[]): Promise<void>;
  /** Contas existentes (utilizadores base + adicionais), para associar a participantes. */
  listAppUsers(): Promise<AppUser[]>;
  /**
   * Ligações participante→conta dos ambientes indicados. É com isto que se
   * decide que contas um utilizador pode ver, sem nunca listar a plataforma
   * toda (ver `domain/tenancy.ts`).
   */
  listMembershipsInSpaces(spaceIds: string[]): Promise<Membership[]>;
  /** Números agregados da plataforma, para a consola do dono. */
  getPlatformStats(): Promise<PlatformStats>;
  listMembers(spaceId: string): Promise<Member[]>;
  addMember(input: AddMemberInput): Promise<Member>;
  updateMember(id: string, spaceId: string, patch: UpdateMemberInput): Promise<void>;
  deleteMember(id: string, spaceId: string): Promise<void>;
  /** Nº de despesas/acertos (não eliminados) que referenciam este participante. */
  countMemberActivity(memberId: string): Promise<number>;

  listExpenses(filters: ExpenseFilters): Promise<Expense[]>;
  /**
   * Uma despesa, pelo id.
   *
   * O `spaceId` é obrigatório e não é decorativo: sem ele isto lê qualquer
   * despesa de qualquer ambiente a quem souber um id. Tudo aqui corre com a
   * chave de serviço, que ignora o RLS, por isso o isolamento entre ambientes
   * é este parâmetro e mais nada. O mesmo vale para as escritas abaixo.
   */
  getExpense(id: string, spaceId: string, viewerId: string): Promise<Expense | null>;
  createExpense(input: CreateExpenseInput): Promise<Expense>;
  updateExpense(id: string, spaceId: string, input: UpdateExpenseInput): Promise<void>;
  setReceiptPath(id: string, spaceId: string, path: string | null): Promise<void>;
  softDeleteExpense(id: string, spaceId: string, actorId: string): Promise<void>;
  /** Fecha o período: marca as despesas partilhadas abertas como liquidadas. Devolve nº afetado. */
  settleOpenExpenses(spaceId: string): Promise<number>;
  /** Reabre o período: limpa a marca de liquidação das despesas do ambiente. */
  reopenExpenses(spaceId: string): Promise<void>;

  /** Confirma uma despesa pendente, fixando o valor real (recorrentes variáveis). */
  confirmExpense(id: string, spaceId: string, amountCents: number): Promise<void>;

  listSettlements(spaceId: string): Promise<Settlement[]>;
  createSettlement(input: CreateSettlementInput): Promise<Settlement>;

  // Despesas recorrentes (REQ-REC).
  listRecurring(spaceId: string): Promise<RecurringTemplate[]>;
  getRecurring(id: string, spaceId: string): Promise<RecurringTemplate | null>;
  createRecurring(input: CreateRecurringInput): Promise<RecurringTemplate>;
  updateRecurring(id: string, spaceId: string, patch: UpdateRecurringInput): Promise<void>;
  deleteRecurring(id: string, spaceId: string): Promise<void>;
  /** Já existe uma despesa gerada para este template nesta data? (idempotência) */
  recurringExpenseExists(recurringId: string, transactionDate: string): Promise<boolean>;
  /**
   * Aplica alterações do template às despesas JÁ geradas por ele (não eliminadas).
   * O valor, se fornecido, é aplicado a todas ou só às pendentes (estimativas),
   * para nunca reescrever valores reais confirmados de recorrentes variáveis.
   */
  updateExpensesForRecurring(
    recurringId: string,
    patch: { description: string; categoryId: string | null; payerId: string; split: Split },
    amount?: { cents: number; onlyPending: boolean },
  ): Promise<void>;

  /** Categorias disponíveis: padrão (space_id null) + as do ambiente indicado. */
  listCategories(spaceId?: string): Promise<Category[]>;
  createCategory(input: CreateCategoryInput): Promise<Category>;
  updateCategory(id: string, spaceId: string, patch: UpdateCategoryInput): Promise<void>;
  deleteCategory(id: string, spaceId: string): Promise<void>;
  listClassificationRules(): Promise<ClassificationRule[]>;

  // Palavra-chave (login interim).
  getUserPasswordHash(userId: string): Promise<string | null>;
  /** Guarda o HASH de um token de recuperação, nunca o token em si. */
  createPasswordResetToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void>;
  /** Token por usar e dentro da validade. Devolve o utilizador. */
  consumePasswordResetToken(tokenHash: string): Promise<{ userId: string } | null>;
  setUserPasswordHash(userId: string, hash: string): Promise<void>;
  /** Utilizadores adicionais (submitters) com login próprio. */
  getAppUserByEmail(email: string): Promise<AppUser | null>;
  createAppUser(input: AppUser): Promise<void>;
  deleteAppUser(id: string): Promise<void>;
  /** Desliga a conta dos participantes, sem apagar o histórico. */
  unlinkUserFromMembers(userId: string): Promise<void>;
  /** Apaga a conta e os ambientes onde era a única pessoa. */
  deleteAccountAndSoleSpaces(userId: string): Promise<void>;
  /** Aprovar (status='approved' -> null) ou rejeitar uma despesa submetida. */
  setExpenseApproval(
    id: string,
    spaceId: string,
    status: "approved" | "rejected",
  ): Promise<void>;
  // Templates de bancos (estrutura confirmada, reutilizável).
  findImportTemplate(fingerprint: string): Promise<ImportTemplate | null>;
  saveImportTemplate(input: Omit<ImportTemplate, "id" | "uses" | "createdAt">): Promise<void>;
  listImportTemplates(): Promise<ImportTemplate[]>;

  // Lembretes de importação por ambiente e banco.
  listImportReminders(spaceId: string): Promise<ImportReminder[]>;
  upsertImportReminder(input: {
    spaceId: string;
    source: string;
    label?: string | null;
    frequency: ReminderFrequency;
    active: boolean;
    createdBy?: string | null;
  }): Promise<void>;
  deleteImportReminder(spaceId: string, source: string): Promise<void>;

  // Metas de despesa por mês (por categoria ou do ambiente inteiro).
  listSpendingGoals(spaceId: string): Promise<SpendingGoal[]>;
  upsertSpendingGoal(input: {
    spaceId: string;
    /** Nulo = meta do ambiente inteiro. */
    categoryId: string | null;
    amountCents: number;
    createdBy?: string | null;
  }): Promise<void>;
  deleteSpendingGoal(spaceId: string, categoryId: string | null): Promise<void>;

  // Património: bens, investimentos e dívidas.
  listAssets(spaceId: string): Promise<Asset[]>;
  createAsset(input: CreateAssetInput): Promise<Asset>;
  updateAsset(id: string, spaceId: string, patch: Partial<CreateAssetInput>): Promise<void>;
  deleteAsset(id: string, spaceId: string): Promise<void>;
  /** Movimentos de todos os investimentos do ambiente, ou só de um. */
  listAssetTrades(spaceId: string, assetId?: string): Promise<AssetTrade[]>;
  /** Cotações guardadas de um símbolo, da mais antiga para a mais recente. */
  listQuotes(symbol: string, fromDate?: string): Promise<StoredQuote[]>;
  /** Só o fecho mais recente, para quem quer o preço e não a série. */
  latestQuote(symbol: string): Promise<StoredQuote | null>;
  /** Guarda cotações, sem duplicar as que já lá estão. */
  saveQuotes(symbol: string, quotes: StoredQuote[], currency: string): Promise<void>;
  /** Em que moeda estão as cotações guardadas deste símbolo. */
  quoteCurrency(symbol: string): Promise<string | null>;
  /** A data da cotação mais recente que temos, para saber se vale a pena ir buscar. */
  latestQuoteDate(symbol: string): Promise<string | null>;
  /** Todos os símbolos registados, de todos os ambientes. Só para diagnóstico. */
  listAllAssetSymbols(): Promise<string[]>;
  createAssetTrade(input: CreateAssetTradeInput): Promise<AssetTrade>;
  deleteAssetTrade(id: string, spaceId: string): Promise<void>;

  // Rendimento.
  listIncome(spaceId: string): Promise<Income[]>;
  createIncome(input: CreateIncomeInput): Promise<Income>;
  deleteIncome(id: string, spaceId: string): Promise<void>;

  /** Nº de despesas por aprovar no ambiente. */
  countPendingApprovals(spaceId: string): Promise<number>;

  // Importação de extratos (REQ-IMP).
  /** UIDs já existentes no ambiente, para deduplicação do import. */
  listExpenseUids(spaceId: string): Promise<{ id: string; uid: string }[]>;
  createImportBatch(input: CreateImportBatchInput): Promise<ImportBatch>;
  listImportBatches(spaceId: string): Promise<ImportBatch[]>;
  /** Anula um lote: elimina (soft-delete) as despesas que criou. */
  undoImportBatch(batchId: string, spaceId: string, userId: string): Promise<number>;

  // Mensagens de contacto da landing.
  createContactMessage(input: CreateContactInput): Promise<void>;
  listContactMessages(): Promise<ContactMessage[]>;
  markContactMessageRead(id: string): Promise<void>;
  setContactMessageArchived(id: string, archived: boolean): Promise<void>;
  setContactMessageNotes(id: string, notes: string | null): Promise<void>;
  countUnreadContactMessages(): Promise<number>;
}
