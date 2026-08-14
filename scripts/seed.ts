/**
 * Seed do Supabase: 2 utilizadores demo + categorias, regras e despesas de
 * exemplo, para a app ser navegável de ponta a ponta.
 *
 * Uso:
 *   1) Configura .env.local com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 *   2) Aplica TODAS as migrações de supabase/migrations, por ordem. São 23, não
 *      só a 0001 — as despesas dependem de tabelas criadas na 0003.
 *   3) npm run seed
 *
 * Em modo "mock" (sem Supabase) NÃO é preciso seed: o repositório em memória já
 * arranca com dados de exemplo.
 */

import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_RULES,
  DEFAULT_SPACE,
  seedAssets,
  seedAssetTrades,
  seedExpenses,
  seedIncomes,
  seedMembers,
  seedQuotes,
  seedSettlements,
  seedSpaces,
} from "../src/lib/data/seed-data";

// Carrega .env.local (Node >= 20.12 / 22).
try {
  process.loadEnvFile(".env.local");
} catch {
  /* sem ficheiro — assume env já no ambiente */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "✗ Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.\n" +
      "  Configura .env.local. (Em modo mock não é preciso seed.)",
  );
  process.exit(1);
}

const emails = (process.env.ALLOWED_EMAILS ?? "tiago@example.com,clara@example.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("→ A semear utilizadores…");
  const users = [
    { id: "tiago", email: emails[0] ?? "tiago@example.com", name: "Tiago", sso_provider: "google" },
    { id: "clara", email: emails[1] ?? "clara@example.com", name: "Clara", sso_provider: "microsoft" },
  ];
  await upsert("app_users", users, "id");

  /**
   * O ambiente e os participantes, que faltavam.
   *
   * Desde a migração `0003` que `expenses.payer_id` e `settlements.from_user_id`
   * apontam para `members(id)`, e não para `app_users(id)`. Este script saltava
   * a tabela `members` por inteiro, por isso numa base de dados nova rebentava
   * na chave estrangeira antes de semear uma única despesa — e a `0003` só
   * consegue converter os utilizadores em participantes se já lá estiverem
   * alguns, o que numa instalação de raiz não acontece.
   */
  console.log("→ A semear o ambiente…");
  await upsert(
    "spaces",
    seedSpaces().map((s) => ({ id: s.id, name: s.name, created_by: s.createdBy })),
    "id",
  );

  console.log("→ A semear participantes…");
  await upsert(
    "members",
    seedMembers().map((m) => ({
      id: m.id,
      space_id: m.spaceId,
      name: m.name,
      linked_user_id: m.linkedUserId ?? null,
      email: m.email ?? null,
    })),
    "id",
  );

  console.log("→ A semear categorias…");
  await upsert(
    "categories",
    DEFAULT_CATEGORIES.map((c) => ({ id: c.id, name: c.name, color: c.color, icon: c.icon })),
    "id",
  );

  console.log("→ A semear regras de classificação…");
  await upsert(
    "classification_rules",
    DEFAULT_RULES.map((r) => ({
      id: r.id,
      keyword: r.keyword,
      category_id: r.categoryId ?? null,
      kind: r.kind ?? null,
      priority: r.priority,
      enabled: r.enabled,
    })),
    "id",
  );

  console.log("→ A semear despesas de exemplo…");
  const expenses = seedExpenses().map((e) => ({
    space_id: e.spaceId ?? DEFAULT_SPACE,
    uid: e.uid,
    description: e.description,
    amount_cents: e.amountCents,
    currency: e.currency,
    transaction_date: e.transactionDate,
    category_id: e.categoryId ?? null,
    payer_id: e.payerId,
    kind: e.kind,
    split: e.split,
    origin: e.origin,
    status: e.status,
    owner_id: e.ownerId,
    visible_to_partner: e.visibleToPartner ?? false,
    created_by: e.createdBy,
  }));
  await upsert("expenses", expenses, "space_id,uid");

  /**
   * Um crédito à habitação misto, para a página das Dívidas não abrir vazia.
   *
   * É o caso que o cálculo de taxa única não sabe fazer: três anos fixa e
   * depois Euribor 6M + spread até 2056, com a prestação a ser recalculada na
   * mudança. Números redondos e inventados — nada aqui é de ninguém.
   */
  console.log("→ A semear um crédito à habitação de exemplo…");
  await upsert(
    "assets",
    [
      {
        id: "ast_seed_habitacao",
        space_id: DEFAULT_SPACE,
        name: "Crédito à habitação",
        kind: "divida",
        value_cents: 150_000_00,
        maturity_date: "2056-01-01",
        credit_terms: {
          periods: [
            { startsOn: "2026-01-01", kind: "fixa", ratePct: 3.3 },
            {
              startsOn: "2029-01-01",
              kind: "variavel",
              indexante: "euribor6m",
              spreadPct: 0.9,
            },
          ],
          indexanteRates: { euribor6m: 2.1 },
        },
      },
    ],
    "id",
  );

  console.log("→ A semear acertos de exemplo…");
  const settlements = seedSettlements().map((s) => ({
    space_id: s.spaceId ?? DEFAULT_SPACE,
    from_user_id: s.fromUserId,
    to_user_id: s.toUserId,
    amount_cents: s.amountCents,
    currency: s.currency,
    date: s.date,
    note: s.note ?? null,
    created_by: s.createdBy,
  }));
  const { error: settleErr } = await db.from("settlements").insert(settlements);
  if (settleErr && !/duplicate/i.test(settleErr.message)) throw settleErr;

  // Património, movimentos, cotações e rendimento. Tudo com id fixo e upsert
  // pela chave primária: correr o seed duas vezes não duplica nada.
  console.log("→ A semear património…");
  await upsert(
    "assets",
    seedAssets().map((a) => ({
      id: a.id,
      space_id: a.spaceId,
      name: a.name,
      kind: a.kind,
      quantity: a.quantity ?? null,
      unit_cost_cents: a.unitCostCents ?? null,
      unit_price_cents: a.unitPriceCents ?? null,
      value_cents: a.valueCents ?? null,
      purchased_at: a.purchasedAt ?? null,
      notes: a.notes ?? null,
      interest_rate_pct: a.interestRatePct ?? null,
      monthly_payment_cents: a.monthlyPaymentCents ?? null,
      term_months: a.termMonths ?? null,
      rate_kind: a.rateKind ?? null,
      symbol: a.symbol ?? null,
      created_by: "tiago",
    })),
    "id",
  );

  console.log("→ A semear movimentos dos investimentos…");
  await upsert(
    "asset_trades",
    seedAssetTrades().map((t) => ({
      id: t.id,
      space_id: t.spaceId,
      asset_id: t.assetId,
      trade_date: t.date,
      kind: t.kind,
      quantity: t.quantity ?? null,
      unit_price_cents: t.unitPriceCents ?? null,
      amount_cents: t.amountCents,
      currency: t.currency ?? null,
      original_amount_cents: t.originalAmountCents ?? null,
      fx_rate: t.fxRate ?? null,
      notes: t.notes ?? null,
      created_by: "tiago",
    })),
    "id",
  );

  console.log("→ A semear cotações…");
  for (const serie of seedQuotes()) {
    const rows = serie.quotes.map((q) => ({
      symbol: serie.symbol,
      quote_date: q.date,
      close_cents: q.closeCents,
      currency: serie.currency,
    }));
    // Aos quinhentos, como no repositório: a API do Supabase não gosta de
    // lotes grandes e uma série inteira são centenas de dias.
    for (let i = 0; i < rows.length; i += 500) {
      await upsert("quotes", rows.slice(i, i + 500), "symbol,quote_date");
    }
  }

  console.log("→ A semear rendimentos…");
  await upsert(
    "income",
    seedIncomes().map((i) => ({
      id: i.id,
      space_id: i.spaceId,
      kind: i.kind,
      description: i.description,
      amount_cents: i.amountCents,
      date: i.date,
      recurring: i.recurring,
      notes: i.notes ?? null,
      created_by: "tiago",
    })),
    "id",
  );

  console.log("✓ Seed concluído.");
}

async function upsert(table: string, rows: Record<string, unknown>[], onConflict: string) {
  const { error } = await db.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`${table}: ${error.message}`);
}

main().catch((err) => {
  console.error("✗ Seed falhou:", err.message ?? err);
  process.exit(1);
});
