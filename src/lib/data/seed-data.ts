/**
 * Dados de exemplo partilhados pelo MockRepository e pelo script de seed.
 *
 * Usa os ids de utilizador default ("tiago" e "clara"), derivados da allow-list
 * default. Se mudares ALLOWED_EMAILS, ajusta também aqui ou no seed.
 */

import { stableUid, equalSplit, percentSplit } from "@/lib/domain";
import type { Expense, Settlement, ClassificationRule } from "@/lib/domain";
import type { Category, Space, Member } from "./repository";

export function seedSpaces(): Space[] {
  return [{ id: DEFAULT_SPACE, name: "Casa", createdBy: TIAGO, createdAt: "2026-01-01T00:00:00Z" }];
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
