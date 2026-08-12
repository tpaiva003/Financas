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
  Crescimento,
  TicketStatus,
  AssetSplit,
  CenarioDcf,
  EtapaAvaliacao,
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
  /** Que fatia deste bem conta para este ambiente, em percentagem. Null = tudo. */
  ownershipPct?: number | null;
  /** Quem tem o resto, quando é alguém deste ambiente. Só para o registo. */
  coOwnerMemberId?: string | null;
  /** Imóvel: área em metros quadrados. Com o preço por m², dá a estimativa. */
  areaM2?: number | null;
  /** Imóvel: concelho, como se escreve. Casa com o nome que o INE devolve. */
  location?: string | null;
  /**
   * Imóvel: preço de referência por m², em cêntimos.
   *
   * **Nunca substitui o `valueCents`.** A mediana do concelho não sabe se a casa
   * é num último andar com vista ou num rés do chão para as traseiras — a
   * estimativa mostra-se ao lado do valor registado, não por cima dele.
   */
  priceRefCents?: number | null;
  /** De onde veio o preço e de quando é ("INE · Lisboa · 2025"). */
  priceRefSource?: string | null;
  /**
   * O código do sítio no INE.
   *
   * Sem ele não há como ir buscar o índice da data da compra — e é isso que faz
   * o valor do imóvel acompanhar a zona. O nome não chega: há nomes repetidos
   * entre níveis (Odivelas é concelho e é freguesia lá dentro).
   */
  priceRefGeocod?: string | null;
  /** Imóvel: o que se pagou. É o ponto de partida do valor estimado. */
  purchasePriceCents?: number | null;
  /** Imóvel: o que se meteu em obras desde a compra. */
  worksCents?: number | null;
  /**
   * Ordem escolhida à mão, dentro do tipo de bem.
   *
   * `null` quer dizer "nunca foi mexida", e nesse caso manda a data de criação —
   * é o que faz esta funcionalidade não mexer em nenhuma lista já vista.
   */
  sortOrder?: number | null;
  /** Símbolo na fonte de cotações (ex.: "vwce.de"). Sem ele, o preço é manual. */
  symbol?: string | null;
  /**
   * A bolsa como a corretora a escreve ("NDQ", "EAM"). Vem do ficheiro.
   *
   * É a pista mais fiável para descobrir o símbolo — diz a praça sem se ter de
   * a adivinhar pelo nome — e serve para filtrar a carteira.
   */
  exchange?: string | null;
  /**
   * Domínio da marca ("apple.com", "ishares.com"), para o logo.
   *
   * Guarda-se o domínio e não um URL de imagem: um URL apodrece quando o
   * fornecedor muda de caminho, e fica um quadrado partido na carteira de
   * alguém. O logo é servido pela rota `/api/logo/[id]` da própria app, nunca
   * pedido pelo browser — ver o cabeçalho dessa rota.
   */
  logoDomain?: string | null;
  /**
   * Numa dívida: que bem é que ela financia.
   *
   * O campo vive na dívida e não no bem porque um imóvel pode ter mais do que
   * um crédito — o da compra e o das obras — e um crédito financia uma coisa
   * só. Serve para mostrar o líquido: o que a casa vale menos o que falta
   * pagar dela.
   */
  financesAssetId?: string | null;

  /**
   * O montante contratado do crédito, em cêntimos.
   *
   * **Não é o que falta pagar** — esse é o `valueCents`. Serve para calcular o
   * capital em dívida a partir do contrato quando ninguém o souber de cabeça, e
   * nunca substitui o que está registado: o cálculo não sabe de amortizações
   * antecipadas nem de comissões, e o valor do banco ganha sempre. Ver
   * `credito-contrato.ts`. E o nome não é `originalAmountCents` de propósito:
   * esse já existe nos movimentos e quer dizer o montante na moeda original.
   */
  contractedAmountCents?: number | null;

  /**
   * Datas que valem um aviso, como a fonte as deu. Ver `datas-mercado.ts`.
   *
   * **Não se apagam depois de passarem.** Uma apresentação de resultados de
   * anteontem explica o salto na cotação que alguém está a olhar hoje; quem lê
   * decide o que mostra, e a coluna guarda o que a fonte disse.
   */
  nextEarningsDate?: string | null;
  dividendDate?: string | null;
  exDividendDate?: string | null;
  /**
   * Quando é que estas datas foram consultadas.
   *
   * Sem isto não se distingue "esta empresa não paga dividendo" de "ainda não
   * fui perguntar" — e o ecrã diria a mesma coisa nos dois casos: nada.
   */
  marketDatesAt?: string | null;
  /**
   * Setor e indústria da empresa, como a fonte lhes chama (em inglês).
   *
   * A tradução para português vive no domínio (`setorPorExtenso`), e não aqui:
   * um nome novo da fonte tem de chegar ao ecrã como está em vez de cair numa
   * fatia "Outros" onde ninguém dá por ele.
   */
  sector?: string | null;
  industry?: string | null;
  /**
   * Quando é que o perfil foi consultado.
   *
   * A mesma razão do `marketDatesAt`: sem isto não se distingue "a fonte não
   * sabe o setor deste ETF" de "ainda não fui perguntar".
   */
  profileAt?: string | null;
  updatedAt?: string | null;
}

export type CreateAssetInput = Omit<Asset, "id" | "updatedAt"> & { createdBy?: string | null };

/**
 * Uma fotografia do património num dia.
 *
 * O património da app é uma fotografia: cada bem tem o valor de hoje e mais
 * nada. O passado não se reconstrói, por isso guarda-se. O histórico começa
 * vazio e enche-se para a frente.
 */
export interface NetWorthSnapshotRow {
  id: string;
  spaceId: string;
  /** "AAAA-MM-DD". */
  onDate: string;
  assetsCents: number;
  debtsCents: number;
  /** Derivado das duas parcelas. Quem lê recalcula em vez de acreditar. */
  netCents: number;
  /** Valor por tipo de bem. Vem de `jsonb`, por isso chega como `unknown`. */
  breakdown?: unknown;
}

export type CreateNetWorthSnapshot = Omit<NetWorthSnapshotRow, "id">;

/**
 * Um ficheiro anexado a um bem: escritura, caderneta, contrato, nota de
 * liquidação.
 *
 * `status` existe porque o ficheiro vai **direto para o Storage**, sem passar
 * pela app — as Server Actions do Next têm tecto de 1 MB e uma função da Vercel
 * ~4,5 MB, e uma escritura digitalizada passa os dois. A linha nasce em
 * `a-enviar` e só conta depois de o envio ser confirmado.
 */
export interface AssetAttachment {
  id: string;
  spaceId: string;
  assetId: string;
  /** O nome original, só para a descarga o devolver ao browser. */
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** `<space_id>/<asset_id>/<id>.<ext>`. Nunca vem do cliente. */
  storagePath: string;
  status: "a-enviar" | "pronto";
  createdBy?: string | null;
  createdAt?: string | null;
}

export type CreateAssetAttachment = Omit<AssetAttachment, "createdAt">;

/**
 * Um pedido de ajuda.
 *
 * **Quem vê:** o autor e o administrador, e mais ninguém — nem os outros
 * participantes do mesmo ambiente. Um pedido leva lá dentro o que a pessoa
 * quiser escrever, incluindo coisas que ela não diria à frente de quem divide
 * as despesas com ela.
 */
export interface Ticket {
  id: string;
  spaceId: string;
  createdBy: string;
  subject: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  /**
   * Nota interna: escrita para quem trata do assunto e **nunca** mostrada a
   * quem abriu o pedido. Chega ao ecrã do utilizador por uma função de leitura
   * que não a devolve de todo — ver `listTicketMessagesPublicas`.
   */
  internal: boolean;
  createdAt: string;
}

/**
 * Um desdobramento gravado, com o ambiente a que pertence.
 *
 * O domínio (`AssetSplit`) não precisa do `space_id` — as contas são as mesmas
 * seja qual for o ambiente. Aqui precisa, porque é o `space_id` passado a cada
 * consulta que faz o isolamento nesta app.
 */
export interface StoredAssetSplit extends AssetSplit {
  spaceId: string;
  notes?: string | null;
  createdAt?: string | null;
}

export interface CreateAssetSplitInput {
  spaceId: string;
  assetId: string;
  date: string;
  ratio: number;
  notes?: string | null;
  createdBy?: string | null;
}

/**
 * Um estudo de avaliação guardado, com os pressupostos **e** o resultado.
 *
 * O resultado vem congelado de propósito: recalculá-lo na leitura fazia com que
 * uma mudança de fórmula reescrevesse a conclusão de uma decisão já tomada. Ver
 * a migração 0037 e `avaliacoes.ts` no domínio.
 */
/**
 * Uma linha do funil de avaliação.
 *
 * **Pode não ter estudo nenhum.** Uma empresa que se apontou hoje entra aqui com
 * nome, data e notas, e mais nada — que é o passo mais barato do processo e era
 * o único que a app não suportava. Os campos do DCF são todos nulos nesse caso,
 * **e ou estão todos preenchidos ou nenhum está**: meio estudo é pior do que
 * nenhum, porque um preço ponderado sobrevive à remoção do fluxo de caixa que o
 * produziu e fica no ecrã como um número que ninguém consegue explicar. A regra
 * está num `check` da migração 0038, e não só na boa vontade de quem escreve.
 */
export interface StoredValuation {
  id: string;
  spaceId: string;
  symbol: string | null;
  name: string;
  stage: EtapaAvaliacao;
  /** O dia em que a empresa entrou no funil, "AAAA-MM-DD". */
  studyDate: string;
  /** O dia do DCF. `null` numa empresa que ainda só está apontada. */
  valuedAt: string | null;
  /** O domínio da marca, para o logo. Mesma ideia dos investimentos. */
  logoDomain: string | null;

  fcfCents: number | null;
  shares: number | null;
  netDebtCents: number | null;
  discountPct: number | null;
  perpetualPct: number | null;
  years: number | null;
  marginPct: number | null;
  /**
   * `null` quando não há estudo, **ou** quando o que estava guardado não passou
   * na validação.
   *
   * Ver `lerCenarios`: um cenário a que falte a probabilidade entraria na média
   * pesada como zero. Sem cenários mostra-se o estudo sem eles, em vez de o
   * mostrar com cenários errados.
   */
  scenarios: CenarioDcf[] | null;

  weightedPriceCents: number | null;
  priceAtStudyCents: number | null;
  upsidePct: number | null;

  notes: string | null;
  /** O que a IA leu nos anexos, e quando. */
  aiSummary: string | null;
  aiSummaryAt: string | null;
  createdAt: string | null;
}

/** Os números de um DCF. Vão sempre juntos — ver o `check` da 0038. */
export interface ValuationEstudo {
  fcfCents: number;
  shares: number;
  netDebtCents: number;
  discountPct: number;
  perpetualPct: number;
  years: number;
  marginPct: number;
  scenarios: CenarioDcf[];
  weightedPriceCents: number;
  priceAtStudyCents: number | null;
  upsidePct: number | null;
  valuedAt: string;
}

export interface CreateValuationInput {
  spaceId: string;
  symbol: string | null;
  name: string;
  stage: EtapaAvaliacao;
  studyDate: string;
  notes: string | null;
  logoDomain?: string | null;
  /** Omitido numa empresa que ainda só está apontada. */
  estudo?: ValuationEstudo | null;
  createdBy?: string | null;
}

/** O que se pode corrigir depois. Campos omitidos ficam como estão. */
export interface UpdateValuationInput {
  stage?: EtapaAvaliacao;
  name?: string;
  symbol?: string | null;
  notes?: string | null;
  logoDomain?: string | null;
  aiSummary?: string | null;
}

/**
 * Um documento de uma avaliação: relatório, apresentação, nota.
 *
 * Tabela própria e não uma coluna a mais nos anexos dos bens: uma empresa em
 * radar **não é um bem** — ainda não se comprou nada. Ver a migração 0038.
 */
export interface ValuationAttachment {
  id: string;
  spaceId: string;
  valuationId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** `<space_id>/avaliacoes/<valuation_id>/<id>.<ext>`. Nunca vem do cliente. */
  storagePath: string;
  status: "a-enviar" | "pronto";
  /** O texto extraído, para a IA não ter de reler o ficheiro a cada pergunta. */
  extractedText: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
}

export type CreateValuationAttachment = Omit<ValuationAttachment, "createdAt" | "extractedText">;

export interface CreateTicketInput {
  spaceId: string;
  createdBy: string;
  subject: string;
  /** A primeira mensagem do fio. Um pedido sem corpo não é um pedido. */
  body: string;
}

export interface CreateTicketMessageInput {
  ticketId: string;
  authorId: string;
  body: string;
  internal: boolean;
}

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
   * Se isto está a aumentar ou parado.
   *
   * `null` quando as leituras de que depende falharam. Uma curva a zeros por
   * não se ter conseguido ler é indistinguível de uma curva a zeros por não
   * haver uso — e as duas dizem coisas opostas.
   */
  crescimento: Crescimento | null;
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
  /**
   * As fotografias do património do ambiente, da mais antiga para a mais recente.
   *
   * Cresce uma por dia: passa as mil linhas ao fim de três anos, e por isso a
   * leitura tem de ser paginada. Uma leitura cortada aqui apagava o princípio do
   * gráfico sem dizer nada.
   */
  listNetWorthSnapshots(spaceId: string): Promise<NetWorthSnapshotRow[]>;
  /** Grava a fotografia do dia. A última do dia manda. */
  saveNetWorthSnapshot(input: CreateNetWorthSnapshot): Promise<void>;
  /** Os anexos de um bem, ou os do ambiente todo quando não se diz qual. */
  listAssetAttachments(spaceId: string, assetId?: string): Promise<AssetAttachment[]>;
  /**
   * Um anexo, pelo id **e** pelo ambiente.
   *
   * Numa consulta só, nunca "ler pelo id e comparar depois": a comparação é o
   * que as pessoas se esquecem de escrever. Como tudo corre com a chave de
   * serviço, que ignora o RLS, este `space_id` é a única fronteira que existe.
   */
  getAssetAttachment(id: string, spaceId: string): Promise<AssetAttachment | null>;
  createAssetAttachment(input: CreateAssetAttachment): Promise<void>;
  /**
   * Passa os anexos de um bem para outro, ao juntar registos repetidos.
   *
   * **Só mexe na linha, nunca no ficheiro.** O `storage_path` fica como está: é
   * ele que manda na leitura, e o id do bem que lá aparece é só o sítio onde o
   * ficheiro calhou nascer. Mover o objeto no Storage seria trabalho a mais para
   * arriscar perder um ficheiro de alguém a meio.
   *
   * Existe porque a coluna tem `on delete cascade`: sem esta passagem, juntar
   * dois registos repetidos apagava os documentos que alguém carregou — uma
   * arrumação de catálogo a destruir ficheiros.
   */
  moveAssetAttachments(fromAssetId: string, toAssetId: string, spaceId: string): Promise<number>;
  markAssetAttachmentReady(id: string, spaceId: string): Promise<void>;
  deleteAssetAttachment(id: string, spaceId: string): Promise<void>;
  /** Movimentos de todos os investimentos do ambiente, ou só de um. */
  listAssetTrades(spaceId: string, assetId?: string): Promise<AssetTrade[]>;
  /** Cotações guardadas de um símbolo, da mais antiga para a mais recente. */
  listQuotes(symbol: string, fromDate?: string): Promise<StoredQuote[]>;
  /** Só o fecho mais recente, para quem quer o preço e não a série. */
  latestQuote(symbol: string): Promise<StoredQuote | null>;
  /**
   * O fecho mais recente de vários símbolos de uma vez.
   *
   * **Existe por causa do tempo que a página do património demorava a abrir.**
   * Por símbolo eram três idas à base de dados (`latestQuoteDate`,
   * `latestQuote`, `quoteCurrency`); com meia centena de investimentos, isso são
   * cento e cinquenta viagens só para desenhar um ecrã que já tinha os dados
   * guardados. Aqui é uma.
   */
  latestQuotesFor(
    symbols: readonly string[],
  ): Promise<Map<string, { date: string; closeCents: number; currency: string }>>;
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
  /**
   * Corrigir um movimento já registado.
   *
   * O `spaceId` é obrigatório e filtra a escrita: um id vindo de um formulário
   * não é prova de nada, e tudo aqui corre com a chave de serviço, que ignora o
   * RLS. Sem este filtro, quem soubesse um id reescrevia o movimento de outra
   * pessoa.
   */
  updateAssetTrade(
    id: string,
    spaceId: string,
    patch: Partial<CreateAssetTradeInput>,
  ): Promise<void>;

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

  // Desdobramentos. Ver `splits.ts` no domínio para o porquê de existirem.
  /** Os desdobramentos do ambiente, ou os de um bem quando se diz qual. */
  listAssetSplits(spaceId: string, assetId?: string): Promise<StoredAssetSplit[]>;
  createAssetSplit(input: CreateAssetSplitInput): Promise<void>;
  deleteAssetSplit(id: string, spaceId: string): Promise<void>;

  // Avaliações de empresas. Ver `avaliacoes.ts` no domínio para as etapas.
  /** Os estudos do ambiente, do mais recente para o mais antigo. */
  listValuations(spaceId: string): Promise<StoredValuation[]>;
  createValuation(input: CreateValuationInput): Promise<string>;
  /** Corrige etapa, nome, notas ou marca. O ambiente filtra a escrita. */
  updateValuation(id: string, spaceId: string, patch: UpdateValuationInput): Promise<void>;
  /**
   * Escreve os números de um DCF numa linha que ainda não os tinha.
   *
   * Separado do `updateValuation` de propósito: os campos do estudo vão sempre
   * todos juntos, e um patch parcial deixaria meio estudo gravado. Ver o `check`
   * da migração 0038.
   */
  setValuationEstudo(id: string, spaceId: string, estudo: ValuationEstudo): Promise<void>;
  deleteValuation(id: string, spaceId: string): Promise<void>;

  // Anexos de uma avaliação. Ver `ValuationAttachment` para o porquê da tabela.
  listValuationAttachments(spaceId: string, valuationId?: string): Promise<ValuationAttachment[]>;
  getValuationAttachment(id: string, spaceId: string): Promise<ValuationAttachment | null>;
  createValuationAttachment(input: CreateValuationAttachment): Promise<void>;
  markValuationAttachmentReady(id: string, spaceId: string): Promise<void>;
  /** Guarda o texto lido do ficheiro, para a IA o poder resumir sem o reler. */
  setValuationAttachmentText(id: string, spaceId: string, texto: string | null): Promise<void>;
  deleteValuationAttachment(id: string, spaceId: string): Promise<void>;

  // Pedidos de ajuda. Ver `Ticket` para a regra das notas internas.
  createTicket(input: CreateTicketInput): Promise<string>;
  /** Os pedidos de uma pessoa, do mais recente para o mais antigo. */
  listTicketsDoUtilizador(userId: string): Promise<Ticket[]>;
  /** Todos os pedidos. Só para o administrador. */
  listTicketsTodos(): Promise<Ticket[]>;
  /**
   * Um pedido, **pelo id e pelo autor**.
   *
   * A verificação vai na consulta e não num `if` depois de ler. É a mesma
   * razão do `space_id` em todo o resto: aqui tudo corre com a chave de
   * serviço, que ignora o RLS, e a comparação feita em JS é a que as pessoas
   * se esquecem de escrever.
   */
  getTicketDoUtilizador(id: string, userId: string): Promise<Ticket | null>;
  getTicket(id: string): Promise<Ticket | null>;
  /**
   * As mensagens que o utilizador pode ler. **Nunca devolve notas internas.**
   *
   * Não tem bandeira nenhuma de propósito: uma `incluirInternas` seria igual a
   * isto até ao dia em que alguém a passasse ao contrário, e aí a nota já foi
   * lida e não há como desfazer.
   */
  listTicketMessagesPublicas(ticketId: string): Promise<TicketMessage[]>;
  /** Tudo, incluindo as notas internas. Só para o administrador. */
  listTicketMessagesTodas(ticketId: string): Promise<TicketMessage[]>;
  addTicketMessage(input: CreateTicketMessageInput): Promise<void>;
  setTicketStatus(id: string, status: TicketStatus): Promise<void>;
  /** Quantos pedidos estão por tratar, para o aviso da consola. */
  countTicketsAbertos(): Promise<number>;

  // Mensagens de contacto da landing.
  createContactMessage(input: CreateContactInput): Promise<void>;
  listContactMessages(): Promise<ContactMessage[]>;
  markContactMessageRead(id: string): Promise<void>;
  setContactMessageArchived(id: string, archived: boolean): Promise<void>;
  setContactMessageNotes(id: string, notes: string | null): Promise<void>;
  countUnreadContactMessages(): Promise<number>;
}
