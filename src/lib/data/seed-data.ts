/**
 * Dados de exemplo partilhados pelo MockRepository e pelo script de seed.
 *
 * Usa os ids de utilizador default ("tiago" e "clara"), derivados da allow-list
 * default. Se mudares ALLOWED_EMAILS, ajusta também aqui ou no seed.
 */

import { stableUid, equalSplit, percentSplit } from "@/lib/domain";
import type { Expense, Settlement, ClassificationRule } from "@/lib/domain";
import type {
  Asset,
  AssetTrade,
  Category,
  Income,
  Member,
  Space,
  StoredQuote,
} from "./repository";

export function seedSpaces(): Space[] {
  return [
    {
      id: DEFAULT_SPACE,
      name: "Casa",
      // O ambiente de exemplo é o dos donos da casa (os emails da allow-list),
      // e esses não levam tectos — ver `planForNewSpace` em `domain/limits.ts`.
      // Sem isto o exemplo arranca com 98 das 100 despesas gratuitas gastas: a
      // app abria já com um aviso de limite e sem espaço para registar nada.
      plan: "full",
      createdBy: TIAGO,
      createdAt: "2026-01-01T00:00:00Z",
    },
  ];
}

export function seedMembers(): Member[] {
  return [
    { id: TIAGO, spaceId: DEFAULT_SPACE, name: "Tiago", linkedUserId: TIAGO, email: "tiago@example.com" },
    { id: CLARA, spaceId: DEFAULT_SPACE, name: "Clara", linkedUserId: CLARA, email: "clara@example.com" },
  ];
}

export const TIAGO = "tiago";
export const CLARA = "clara";
export const DEFAULT_SPACE = "casa";

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "supermercado", name: "Supermercado", color: "#16a34a", icon: "🛒" },
  { id: "restauracao", name: "Restauração", color: "#ea580c", icon: "🍽️" },
  { id: "combustivel", name: "Combustível", color: "#dc2626", icon: "⛽" },
  { id: "casa", name: "Casa", color: "#2563eb", icon: "🏠" },
  { id: "saude", name: "Saúde", color: "#0891b2", icon: "💊" },
  { id: "lazer", name: "Lazer", color: "#7c3aed", icon: "🎬" },
  { id: "subscricoes", name: "Subscrições", color: "#db2777", icon: "📺" },
  { id: "transportes", name: "Transportes", color: "#0d9488", icon: "🚆" },
  { id: "outros", name: "Outros", color: "#64748b", icon: "📦" },
];

export const DEFAULT_RULES: ClassificationRule[] = [
  { id: "rule-continente", keyword: "continente", categoryId: "supermercado", kind: "shared", priority: 10, enabled: true },
  { id: "rule-pingo", keyword: "pingo doce", categoryId: "supermercado", kind: "shared", priority: 10, enabled: true },
  { id: "rule-lidl", keyword: "lidl", categoryId: "supermercado", kind: "shared", priority: 10, enabled: true },
  { id: "rule-galp", keyword: "galp", categoryId: "combustivel", kind: "shared", priority: 20, enabled: true },
  { id: "rule-bp", keyword: "bp ", categoryId: "combustivel", kind: "shared", priority: 20, enabled: true },
  { id: "rule-edp", keyword: "edp", categoryId: "casa", kind: "shared", priority: 20, enabled: true },
  { id: "rule-spotify", keyword: "spotify", categoryId: "subscricoes", kind: "personal", priority: 5, enabled: true },
  { id: "rule-netflix", keyword: "netflix", categoryId: "subscricoes", kind: "shared", priority: 5, enabled: true },
  { id: "rule-cp", keyword: "comboios", categoryId: "transportes", kind: "shared", priority: 30, enabled: true },
];

function mkExpense(e: {
  id: string;
  description: string;
  amountCents: number;
  date: string;
  payerId: string;
  kind: Expense["kind"];
  categoryId: string;
  split?: Expense["split"];
  origin?: Expense["origin"];
  status?: Expense["status"];
  ownerId?: string;
  visibleToPartner?: boolean;
}): Expense {
  const uid = stableUid({
    source: e.origin ?? "manual",
    description: e.description,
    amountCents: e.amountCents,
    currency: "EUR",
    transactionDate: e.date,
    account: null,
  });
  return {
    id: e.id,
    spaceId: DEFAULT_SPACE,
    uid,
    description: e.description,
    amountCents: e.amountCents,
    currency: "EUR",
    transactionDate: e.date,
    categoryId: e.categoryId,
    payerId: e.payerId,
    kind: e.kind,
    split: e.split ?? equalSplit(),
    origin: e.origin ?? "manual",
    status: e.status ?? "confirmed",
    ownerId: e.ownerId ?? e.payerId,
    visibleToPartner: e.visibleToPartner ?? false,
    createdBy: e.payerId,
    createdAt: `${e.date}T10:00:00Z`,
    updatedAt: `${e.date}T10:00:00Z`,
    deletedAt: null,
  };
}

/**
 * Histórico de exemplo: um ano e pico de despesas, para a app ser navegável de
 * ponta a ponta. Sem isto, os relatórios não têm com que comparar, não há
 * média nem período homólogo, e metade dos ecrãs fica vazia.
 *
 * Os valores variam de forma determinística (nada de aleatório: as capturas e
 * os testes têm de dar sempre o mesmo).
 */
const HISTORY_START = "2025-07";
/** Último mês do histórico; fica parcial, como um mês a decorrer. */
const HISTORY_END = "2026-08";
const PARTIAL_UNTIL_DAY = 5;

interface Recurring {
  day: number;
  description: string;
  categoryId: string;
  /** Valor base em cêntimos. */
  base: number;
  /** Amplitude da variação mês a mês. */
  swing: number;
  payer: string;
  kind?: "shared" | "personal";
}

const HISTORY_PATTERN: Recurring[] = [
  { day: 2, description: "Continente, compras da semana", categoryId: "supermercado", base: 8700, swing: 2200, payer: TIAGO },
  { day: 5, description: "Jantar restaurante Cais", categoryId: "restauracao", base: 5400, swing: 2600, payer: CLARA },
  { day: 7, description: "Galp combustível", categoryId: "combustivel", base: 6200, swing: 1500, payer: TIAGO },
  { day: 10, description: "EDP eletricidade", categoryId: "casa", base: 7300, swing: 2400, payer: CLARA },
  { day: 12, description: "Netflix", categoryId: "subscricoes", base: 1399, swing: 0, payer: TIAGO },
  { day: 18, description: "Pingo Doce, compras", categoryId: "supermercado", base: 4600, swing: 1800, payer: CLARA },
  { day: 21, description: "Comboios CP fim de semana", categoryId: "transportes", base: 3120, swing: 900, payer: CLARA },
];

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const d = new Date(Date.UTC(fy!, fm! - 1, 1));
  const end = new Date(Date.UTC(ty!, tm! - 1, 1));
  while (d <= end) {
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

function historyExpenses(): Expense[] {
  const months = monthsBetween(HISTORY_START, HISTORY_END);
  const last = months.at(-1);
  const out: Expense[] = [];

  months.forEach((ym, i) => {
    for (const [j, item] of HISTORY_PATTERN.entries()) {
      // O último mês está a meio: só entra o que já aconteceu.
      if (ym === last && item.day > PARTIAL_UNTIL_DAY) continue;
      // Onda determinística: sobe e desce ao longo do ano, sem repetir valores.
      const wave = Math.sin((i * 1.3 + j) % 7) * item.swing;
      const amountCents = Math.max(300, Math.round((item.base + wave) / 10) * 10);
      out.push(
        mkExpense({
          id: `hist-${ym}-${j}`,
          description: item.description,
          amountCents,
          date: `${ym}-${String(item.day).padStart(2, "0")}`,
          payerId: item.payer,
          kind: item.kind ?? "shared",
          categoryId: item.categoryId,
        }),
      );
    }
  });

  return out;
}

export function seedExpenses(): Expense[] {
  return [
    ...historyExpenses(),
    // Casos especiais, no último mês completo: divisão por percentagem, despesa
    // pessoal (só do próprio), pessoal visível ao parceiro, estorno negativo e
    // uma recorrente por confirmar.
    mkExpense({ id: "seed-4", description: "EDP eletricidade (acerto anual)", amountCents: 11845, date: "2026-07-10", payerId: CLARA, kind: "shared", categoryId: "casa", split: percentSplit({ [TIAGO]: 50, [CLARA]: 50 }) }),
    mkExpense({ id: "seed-6", description: "Spotify (pessoal)", amountCents: 699, date: "2026-07-12", payerId: CLARA, kind: "personal", categoryId: "subscricoes", ownerId: CLARA }),
    mkExpense({ id: "seed-7", description: "Farmácia", amountCents: 2380, date: "2026-07-15", payerId: TIAGO, kind: "personal", categoryId: "saude", ownerId: TIAGO, visibleToPartner: true }),
    mkExpense({ id: "seed-9", description: "Estorno devolução loja", amountCents: -1500, date: "2026-07-20", payerId: TIAGO, kind: "shared", categoryId: "outros" }),
    mkExpense({ id: "seed-10", description: "Água, recorrente (por confirmar)", amountCents: 2800, date: "2026-08-03", payerId: TIAGO, kind: "shared", categoryId: "casa", origin: "recurring", status: "pending" }),
  ];
}

export function seedSettlements(): Settlement[] {
  return [
    {
      id: "settle-1",
      spaceId: DEFAULT_SPACE,
      fromUserId: CLARA,
      toUserId: TIAGO,
      amountCents: 3000,
      currency: "EUR",
      date: "2026-06-01",
      note: "Acerto de maio",
      createdBy: CLARA,
      createdAt: "2026-06-01T09:00:00Z",
    },
  ];
}

// ===========================================================================
// Património, investimentos e rendimentos
//
// Sem isto, metade da app abria vazia: património, dívidas, rentabilidade,
// comparação com o índice, FIRE e taxa de poupança não têm nada para mostrar
// enquanto não houver bens, movimentos datados, cotações e rendimento.
//
// Três regras que valem para tudo o que vem a seguir:
//
// 1. **Determinístico.** Nada de `Math.random` nem de "hoje": os mesmos dados
//    saem sempre iguais, porque servem para capturas de ecrã e para testes.
// 2. **Dentro da mesma janela do histórico de despesas** (2025-07 a 2026-08),
//    senão os ecrãs mostram investimentos de um ano e despesas de outro.
// 3. **Plausível para um casal em Portugal**: um apartamento com crédito à
//    habitação, um depósito a prazo, dois ETFs UCITS em euros e uma ação
//    americana em dólares. O património líquido dá positivo e modesto.
// ===========================================================================

/** Primeiro e último dia com cotação nas séries de exemplo. */
const QUOTES_START = "2025-07-01";
/**
 * Fim das séries.
 *
 * Fica um dia antes da data em que este exemplo foi montado, de propósito:
 * `isStale` (ver `domain/quotes.ts`) dá dois dias de folga, por isso uma série
 * que acaba aqui é considerada fresca e **a app desenha-se sem ir à rede**.
 */
const QUOTES_END = "2026-08-11";

/**
 * Câmbio usado nos exemplos em dólares: unidades de USD por euro.
 *
 * Fixo à mão porque a taxa real vem do BCE por rede, e o exemplo tem de dar
 * sempre os mesmos números. É a taxa de referência de 11/08/2026, arredondada.
 */
const USD_PER_EUR = 1.079;

/**
 * Uma série de cotações descrita por poucos números.
 *
 * Escrever fechos diários à mão seria centenas de linhas impossíveis de manter
 * e de ler. Uma tendência suave com ondulação chega para o que estes ecrãs
 * precisam: preços que sobem ao longo do ano mas não em linha reta, para a
 * rentabilidade e a comparação com o índice terem forma.
 */
interface SeriesSpec {
  symbol: string;
  currency: "EUR" | "USD";
  /** Fecho no primeiro dia da série, em cêntimos da moeda dela. */
  startCents: number;
  /** Tendência anual, em percentagem. */
  driftPct: number;
  /** Amplitude da ondulação, em percentagem do preço. */
  swingPct: number;
  /** Período da ondulação, em dias. */
  periodDays: number;
  /** Desfasamento da onda, para as séries não subirem e descerem todas juntas. */
  phase: number;
}

/**
 * As séries de exemplo.
 *
 * Além dos três investimentos da carteira, estão aqui os **índices de
 * referência**: `sxr8.de` e `eunl.de` são os primeiros símbolos de cada
 * benchmark em `domain/quotes.ts`. Sem eles guardados, a comparação "e se
 * tivesse ido para o índice?" só funcionaria com rede.
 */
const QUOTE_SERIES: SeriesSpec[] = [
  { symbol: "vwce.de", currency: "EUR", startCents: 12_480, driftPct: 8, swingPct: 3.5, periodDays: 214, phase: 1 },
  { symbol: "vhyd.de", currency: "EUR", startCents: 6_190, driftPct: 4.5, swingPct: 4, periodDays: 158, phase: 3 },
  { symbol: "aapl.us", currency: "USD", startCents: 21_450, driftPct: 11, swingPct: 5, periodDays: 131, phase: 2 },
  { symbol: "sxr8.de", currency: "EUR", startCents: 58_400, driftPct: 11, swingPct: 4, periodDays: 187, phase: 1.6 },
  { symbol: "eunl.de", currency: "EUR", startCents: 10_180, driftPct: 6, swingPct: 3.2, periodDays: 203, phase: 3.5 },
];

/** Dias de bolsa entre duas datas: fins de semana ficam de fora. */
function tradingDays(from: string, to: string): { date: string; day: number }[] {
  const out: { date: string; day: number }[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let day = 0;
  while (cursor <= end) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      out.push({ date: cursor.toISOString().slice(0, 10), day });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    day += 1;
  }
  return out;
}

function buildSeries(spec: SeriesSpec): StoredQuote[] {
  return tradingDays(QUOTES_START, QUOTES_END).map(({ date, day }) => {
    const years = day / 365.25;
    const trend = Math.pow(1 + spec.driftPct / 100, years);
    const wave =
      1 + (spec.swingPct / 100) * Math.sin((2 * Math.PI * day) / spec.periodDays + spec.phase);
    return { date, closeCents: Math.round(spec.startCents * trend * wave) };
  });
}

// As séries são reutilizadas para tirar preços de compra: calcula-se uma vez.
const seriesCache = new Map<string, StoredQuote[]>();

function seriesOf(symbol: string): StoredQuote[] {
  const cached = seriesCache.get(symbol);
  if (cached) return cached;
  const spec = QUOTE_SERIES.find((s) => s.symbol === symbol);
  const quotes = spec ? buildSeries(spec) : [];
  seriesCache.set(symbol, quotes);
  return quotes;
}

/** O fecho de um dia, ou o último anterior (fins de semana e feriados). */
function closeOn(symbol: string, date: string): number {
  let out = 0;
  for (const q of seriesOf(symbol)) {
    if (q.date > date) break;
    out = q.closeCents;
  }
  return out;
}

/** O último fecho da série, na moeda dela. */
function lastClose(symbol: string): number {
  return seriesOf(symbol).at(-1)?.closeCents ?? 0;
}

export interface SeedQuoteSeries {
  symbol: string;
  currency: string;
  quotes: StoredQuote[];
}

/**
 * Cotações guardadas dos investimentos e dos índices de referência.
 *
 * Guardadas na moeda em que cada símbolo cota, como manda a tabela `quotes`:
 * o `aapl.us` vem em dólares, e gravá-lo como se fossem euros inflacionava o
 * património (foi o erro que a migração 0019 veio corrigir).
 */
export function seedQuotes(): SeedQuoteSeries[] {
  return QUOTE_SERIES.map((spec) => ({
    symbol: spec.symbol,
    currency: spec.currency,
    quotes: buildSeries(spec),
  }));
}

const ASSET_CONTA = "ast-conta";
const ASSET_PRAZO = "ast-prazo";
const ASSET_CASA = "ast-casa";
const ASSET_CREDITO = "ast-credito";
const ASSET_VWCE = "ast-vwce";
const ASSET_VHYD = "ast-vhyd";
const ASSET_AAPL = "ast-aapl";

/** Compras do exemplo: as unidades e a data; o preço sai da série de cotações. */
interface BuyPlan {
  assetId: string;
  symbol: string;
  date: string;
  quantity: number;
  /** Câmbio da operação, quando ela não foi em euros. */
  fxRate?: number;
}

const BUYS: BuyPlan[] = [
  // Ordem permanente trimestral no ETF mundial: o caso mais comum de quem
  // investe a partir de Portugal, e o que dá sentido à TIR (o dinheiro entrou
  // aos poucos, e um euro de julho não é comparável com um euro de julho a
  // seguir).
  { assetId: ASSET_VWCE, symbol: "vwce.de", date: "2025-07-15", quantity: 14 },
  { assetId: ASSET_VWCE, symbol: "vwce.de", date: "2025-10-15", quantity: 14 },
  { assetId: ASSET_VWCE, symbol: "vwce.de", date: "2026-01-15", quantity: 15 },
  { assetId: ASSET_VWCE, symbol: "vwce.de", date: "2026-04-15", quantity: 14 },
  { assetId: ASSET_VWCE, symbol: "vwce.de", date: "2026-07-15", quantity: 13 },
  // ETF de distribuição: é dele que vêm os dividendos.
  { assetId: ASSET_VHYD, symbol: "vhyd.de", date: "2025-08-19", quantity: 30 },
  { assetId: ASSET_VHYD, symbol: "vhyd.de", date: "2026-02-17", quantity: 28 },
  // Ação americana, comprada em dólares: exercita o câmbio de ponta a ponta.
  { assetId: ASSET_AAPL, symbol: "aapl.us", date: "2025-10-07", quantity: 5, fxRate: 1.0925 },
  { assetId: ASSET_AAPL, symbol: "aapl.us", date: "2026-03-10", quantity: 4, fxRate: 1.084 },
];

/** Distribuições do ETF de dividendos: data e valor recebido, em cêntimos. */
const DIVIDENDS: { date: string; amountCents: number }[] = [
  { date: "2025-09-24", amountCents: 1_500 },
  { date: "2025-12-23", amountCents: 1_650 },
  { date: "2026-03-24", amountCents: 3_020 },
  { date: "2026-06-23", amountCents: 3_310 },
];

/**
 * Movimentos datados dos investimentos.
 *
 * São eles que mandam na posição (ver `domain/positions.ts`): a quantidade e o
 * custo médio saem daqui, e é por terem data que há TIR e comparação com o
 * índice. Os preços vêm das mesmas séries de cotações, para o custo de compra
 * e a cotação de hoje contarem a mesma história.
 */
export function seedAssetTrades(): AssetTrade[] {
  const out: AssetTrade[] = [];

  BUYS.forEach((b, i) => {
    const close = closeOn(b.symbol, b.date);
    const unitPriceCents = b.fxRate ? Math.round(close / b.fxRate) : close;
    const amountCents = Math.round(b.quantity * unitPriceCents);
    out.push({
      id: `atr-${String(i + 1).padStart(2, "0")}`,
      spaceId: DEFAULT_SPACE,
      assetId: b.assetId,
      date: b.date,
      kind: "compra",
      quantity: b.quantity,
      unitPriceCents,
      amountCents,
      currency: b.fxRate ? "USD" : null,
      originalAmountCents: b.fxRate ? Math.round(b.quantity * close) : null,
      fxRate: b.fxRate ?? null,
      notes: null,
      createdAt: `${b.date}T09:30:00Z`,
    });
  });

  DIVIDENDS.forEach((d, i) => {
    out.push({
      id: `atr-div-${i + 1}`,
      spaceId: DEFAULT_SPACE,
      assetId: ASSET_VHYD,
      date: d.date,
      kind: "dividendo",
      quantity: null,
      unitPriceCents: null,
      amountCents: d.amountCents,
      currency: null,
      originalAmountCents: null,
      fxRate: null,
      notes: "Distribuição trimestral, já líquida de retenção.",
      createdAt: `${d.date}T09:30:00Z`,
    });
  });

  // Uma comissão, para o custo da carteira não ser só o preço das unidades.
  out.push({
    id: "atr-custo-1",
    spaceId: DEFAULT_SPACE,
    assetId: ASSET_VWCE,
    date: "2026-01-15",
    kind: "custo",
    quantity: null,
    unitPriceCents: null,
    amountCents: 495,
    currency: null,
    originalAmountCents: null,
    fxRate: null,
    notes: "Comissão de corretagem.",
    createdAt: "2026-01-15T09:30:00Z",
  });

  return out.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));
}

/** Posição escrita no ativo, para bater certo com a que sai dos movimentos. */
function positionFromTrades(assetId: string): { quantity: number; unitCostCents: number } {
  const own = seedAssetTrades().filter((t) => t.assetId === assetId);
  let quantity = 0;
  let costCents = 0;
  for (const t of own) {
    if (t.kind === "compra") {
      quantity += t.quantity ?? 0;
      costCents += t.amountCents;
    } else if (t.kind === "custo") {
      costCents += t.amountCents;
    }
  }
  return {
    quantity,
    unitCostCents: quantity > 0 ? Math.round(costCents / quantity) : 0,
  };
}

/** Preço atual de um investimento, em cêntimos de euro. */
function currentPriceEur(symbol: string, foreign = false): number {
  const close = lastClose(symbol);
  return foreign ? Math.round(close / USD_PER_EUR) : close;
}

/**
 * Bens, dívida e investimentos de exemplo.
 *
 * O casal comprou casa em setembro de 2025 com 90% de financiamento, o que
 * explica a forma do património: muito imóvel, muita dívida, e um líquido
 * positivo mas pequeno. É o retrato honesto de quem acabou de comprar, e é
 * mais útil do que um património redondo que ninguém reconhece.
 */
export function seedAssets(): Asset[] {
  const vwce = positionFromTrades(ASSET_VWCE);
  const vhyd = positionFromTrades(ASSET_VHYD);
  const aapl = positionFromTrades(ASSET_AAPL);
  const updatedAt = `${QUOTES_END}T18:00:00Z`;

  const base = { spaceId: DEFAULT_SPACE, updatedAt };

  return [
    {
      ...base,
      id: ASSET_CONTA,
      name: "Conta à ordem, Millennium",
      kind: "conta",
      valueCents: 324_000,
      purchasedAt: null,
      notes: "Conta conjunta, onde entram os ordenados e sai a prestação.",
    },
    {
      ...base,
      id: ASSET_PRAZO,
      name: "Depósito a prazo, 12 meses",
      kind: "conta",
      valueCents: 900_000,
      purchasedAt: "2025-11-14",
      interestRatePct: 2.6,
      rateKind: "fixa",
      notes: "Fundo de emergência. Juros creditados todos os meses.",
    },
    {
      ...base,
      id: ASSET_CASA,
      name: "Apartamento T2, Almada",
      kind: "imovel",
      valueCents: 23_200_000,
      purchasedAt: "2025-09-12",
      notes: "Comprado por 232 000 €, com 10% de entrada.",
    },
    {
      ...base,
      id: ASSET_CREDITO,
      name: "Crédito à habitação, Millennium",
      kind: "divida",
      valueCents: 20_590_000,
      purchasedAt: "2025-09-12",
      interestRatePct: 3.35,
      rateKind: "variavel",
      monthlyPaymentCents: 84_490,
      termMonths: 409,
      notes: "Euribor a 6 meses mais spread de 0,9%. Revisão em março.",
    },
    {
      ...base,
      id: ASSET_VWCE,
      name: "Vanguard FTSE All-World (VWCE)",
      kind: "investimento",
      symbol: "vwce.de",
      quantity: vwce.quantity,
      unitCostCents: vwce.unitCostCents,
      unitPriceCents: currentPriceEur("vwce.de"),
      purchasedAt: "2025-07-15",
      notes: "Ordem permanente trimestral, de acumulação.",
    },
    {
      ...base,
      id: ASSET_VHYD,
      name: "Vanguard All-World High Dividend (VHYD)",
      kind: "investimento",
      symbol: "vhyd.de",
      quantity: vhyd.quantity,
      unitCostCents: vhyd.unitCostCents,
      unitPriceCents: currentPriceEur("vhyd.de"),
      purchasedAt: "2025-08-19",
      notes: "De distribuição: paga dividendo de três em três meses.",
    },
    {
      ...base,
      id: ASSET_AAPL,
      name: "Apple (AAPL)",
      kind: "investimento",
      symbol: "aapl.us",
      quantity: aapl.quantity,
      unitCostCents: aapl.unitCostCents,
      unitPriceCents: currentPriceEur("aapl.us", true),
      purchasedAt: "2025-10-07",
      notes: "Comprada em dólares: o valor em euros já leva o câmbio do dia.",
    },
  ];
}

/**
 * Rendimento de exemplo: o que entra, mês a mês.
 *
 * Dois ordenados (com subsídios de férias e de Natal, que em Portugal são
 * metade da diferença entre um número bonito e um número real), os juros do
 * depósito e os dividendos do ETF de distribuição. É isto que torna a taxa de
 * poupança e a percentagem de despesas coberta por rendimento passivo números
 * calculados, e não palpites.
 */
export function seedIncomes(): Income[] {
  const out: Income[] = [];
  const months = monthsBetween(HISTORY_START, HISTORY_END);

  // Dois ordenados líquidos que dão 3 470 € por mês: com a prestação de
  // 844,90 €, a taxa de esforço fica em 24%, dentro do que um banco português
  // aceita para o crédito que está registado no património.
  const ordenados = [
    { id: TIAGO, name: "Tiago", article: "do", amountCents: 185_000 },
    { id: CLARA, name: "Clara", article: "da", amountCents: 162_000 },
  ];

  for (const ym of months) {
    for (const o of ordenados) {
      out.push({
        id: `inc-${ym}-${o.id}`,
        spaceId: DEFAULT_SPACE,
        kind: "salario",
        description: `Ordenado ${o.article} ${o.name}`,
        amountCents: o.amountCents,
        date: `${ym}-04`,
        recurring: true,
      });
    }

    // Juros do depósito a prazo, creditados todos os meses. Só a partir do mês
    // seguinte à constituição: antes disso não havia depósito nenhum.
    if (ym >= "2025-12") {
      out.push({
        id: `inc-${ym}-juros`,
        spaceId: DEFAULT_SPACE,
        kind: "juros",
        description: "Juros do depósito a prazo",
        amountCents: 1_950,
        date: `${ym}-05`,
        recurring: true,
        notes: "9 000 € a 2,6% ao ano.",
      });
    }
  }

  // Subsídios de Natal e de férias: os dois meses a mais do ano português.
  for (const s of [
    { ym: "2025-12", label: "Subsídio de Natal" },
    { ym: "2026-06", label: "Subsídio de férias" },
  ]) {
    for (const o of ordenados) {
      out.push({
        id: `inc-${s.ym}-${o.id}-subsidio`,
        spaceId: DEFAULT_SPACE,
        kind: "salario",
        description: `${s.label} (${o.name})`,
        amountCents: o.amountCents,
        date: `${s.ym}-04`,
        recurring: false,
      });
    }
  }

  // Dividendos: os mesmos valores e as mesmas datas dos movimentos do VHYD.
  DIVIDENDS.forEach((d, i) => {
    out.push({
      id: `inc-div-${i + 1}`,
      spaceId: DEFAULT_SPACE,
      kind: "dividendos",
      description: "Dividendos do VHYD",
      amountCents: d.amountCents,
      date: d.date,
      recurring: false,
    });
  });

  out.push({
    id: "inc-extra-1",
    spaceId: DEFAULT_SPACE,
    kind: "extra",
    description: "Formação dada ao fim de semana",
    amountCents: 45_000,
    date: "2026-02-20",
    recurring: false,
    notes: "Recibo verde, valor já líquido de retenção.",
  });

  return out.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));
}
