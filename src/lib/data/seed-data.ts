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

export function seedExpenses(): Expense[] {
  return [
    mkExpense({ id: "seed-1", description: "Continente, compras da semana", amountCents: 8732, date: "2026-06-02", payerId: TIAGO, kind: "shared", categoryId: "supermercado" }),
    mkExpense({ id: "seed-2", description: "Jantar restaurante Cais", amountCents: 5400, date: "2026-06-05", payerId: CLARA, kind: "shared", categoryId: "restauracao" }),
    mkExpense({ id: "seed-3", description: "Galp combustível", amountCents: 6210, date: "2026-06-07", payerId: TIAGO, kind: "shared", categoryId: "combustivel" }),
    mkExpense({ id: "seed-4", description: "EDP eletricidade", amountCents: 7345, date: "2026-06-10", payerId: CLARA, kind: "shared", categoryId: "casa", split: percentSplit({ [TIAGO]: 50, [CLARA]: 50 }) }),
    mkExpense({ id: "seed-5", description: "Netflix", amountCents: 1399, date: "2026-06-12", payerId: TIAGO, kind: "shared", categoryId: "subscricoes" }),
    mkExpense({ id: "seed-6", description: "Spotify (pessoal)", amountCents: 699, date: "2026-06-12", payerId: CLARA, kind: "personal", categoryId: "subscricoes", ownerId: CLARA }),
    mkExpense({ id: "seed-7", description: "Farmácia", amountCents: 2380, date: "2026-06-15", payerId: TIAGO, kind: "personal", categoryId: "saude", ownerId: TIAGO, visibleToPartner: true }),
    mkExpense({ id: "seed-8", description: "Comboios CP fim de semana", amountCents: 3120, date: "2026-06-18", payerId: CLARA, kind: "shared", categoryId: "transportes" }),
    mkExpense({ id: "seed-9", description: "Estorno devolução loja", amountCents: -1500, date: "2026-06-20", payerId: TIAGO, kind: "shared", categoryId: "outros" }),
    mkExpense({ id: "seed-10", description: "Água, recorrente (por confirmar)", amountCents: 2800, date: "2026-06-25", payerId: TIAGO, kind: "shared", categoryId: "casa", origin: "recurring", status: "pending" }),
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
