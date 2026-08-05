import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpaceContext } from "@/lib/space";
import { getRepository } from "@/lib/data";
import type { Asset } from "@/lib/data";
import {
  ASSET_KIND_LABELS,
  buildNetWorth,
  formatCents,
  type AssetKind,
  type AssetView,
} from "@/lib/domain";
import { FireCalculator } from "@/components/FireCalculator";
import { AssetForm } from "@/components/AssetForm";
import { deleteAssetAction, updateAssetPriceAction } from "@/app/(app)/actions";

export const metadata = { title: "Património · Rachar" };
export const dynamic = "force-dynamic";

export default async function PatrimonioPage() {
  const ctx = await getSpaceContext();
  if (ctx.viewerRole === "submitter") redirect("/despesas");

  const repo = getRepository();
  // A tabela pode não existir se a migração 0013 ainda não correu.
  const assets: Asset[] = await repo.listAssets(ctx.space.id).catch(() => []);
  const net = buildNetWorth(assets);

  // Gasto anual sugerido para o FIRE: a partir das despesas reais do ambiente,
  // média dos meses com movimento, para não contar meses vazios como zero.
  const expenses = await repo
    .listExpenses({ spaceId: ctx.space.id, viewerId: ctx.viewerMemberId })
    .catch(() => []);
  const byMonth = new Map<string, number>();
  for (const e of expenses) {
    if (e.status !== "confirmed" || e.deletedAt) continue;
    const ym = e.transactionDate.slice(0, 7);
    byMonth.set(ym, (byMonth.get(ym) ?? 0) + e.amountCents);
  }
  const monthlyAverage =
    byMonth.size > 0
      ? Math.round([...byMonth.values()].reduce((a, b) => a + b, 0) / byMonth.size)
      : 0;

  const byKind = new Map<AssetKind, AssetView[]>();
  for (const a of net.assets) {
    byKind.set(a.kind, [...(byKind.get(a.kind) ?? []), a]);
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">{ctx.space.name}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Património</h1>
        <p className="mt-1 text-sm text-fg-muted">
          O que tens menos o que deves. Contas, imóveis, investimentos e créditos
          na mesma conta, para saberes onde estás.
        </p>
      </div>

      <section className="card p-6">
        <p className="eyebrow">Património líquido</p>
        <p
          className={`mt-2 font-display text-5xl font-semibold tracking-tightest tnum ${
            net.netCents < 0 ? "text-debt" : ""
          }`}
        >
          {formatCents(net.netCents)}
        </p>
        <p className="mt-2 text-sm text-fg-muted">
          {formatCents(net.totalAssetsCents)} em bens
          {net.totalLiabilitiesCents > 0
            ? `, menos ${formatCents(net.totalLiabilitiesCents)} de dívidas`
            : ""}
          .
        </p>

        {net.investmentCostCents > 0 ? (
          <p className="mt-3 text-sm">
            Investimentos:{" "}
            <span className={net.investmentGainCents >= 0 ? "text-credit" : "text-debt"}>
              {net.investmentGainCents >= 0 ? "+" : ""}
              {formatCents(net.investmentGainCents)}
            </span>{" "}
            <span className="text-fg-faint">
              sobre {formatCents(net.investmentCostCents)} investidos
            </span>
          </p>
        ) : null}
        {net.investmentsMissingPrice > 0 ? (
          <p className="mt-1 text-xs text-fg-faint">
            {net.investmentsMissingPrice} investimento(s) sem preço atual. Enquanto
            faltar, contam pelo que custaram e ficam de fora do ganho, para o
            número não mentir.
          </p>
        ) : null}
      </section>

      {net.byKind.length > 0 ? (
        <section className="card p-5">
          <p className="eyebrow mb-3">Onde está</p>
          <ul className="space-y-3">
            {net.byKind.map((k) => {
              const max = Math.max(...net.byKind.map((x) => x.totalCents), 1);
              return (
                <li key={k.kind}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="text-fg">{k.label}</span>
                    <span className="font-mono tnum text-fg-muted">{formatCents(k.totalCents)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-panel2">
                    <div
                      className={`h-full rounded-full ${k.kind === "divida" ? "bg-debt" : "bg-credit"}`}
                      style={{ width: `${Math.max(2, (k.totalCents / max) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <FireCalculator
        netWorthCents={net.netCents}
        suggestedAnnualExpensesCents={monthlyAverage * 12}
      />

      <section className="space-y-3">
        <h2 className="eyebrow">O que tens</h2>
        {net.assets.length === 0 ? (
          <p className="card p-8 text-center text-sm text-fg-muted">
            Ainda não registaste nada. Começa por uma conta ou um investimento.
          </p>
        ) : (
          (Object.keys(ASSET_KIND_LABELS) as AssetKind[])
            .filter((k) => (byKind.get(k) ?? []).length > 0)
            .map((kind) => (
              <div key={kind} className="card p-0">
                <p className="label mb-0 px-5 pt-4">{ASSET_KIND_LABELS[kind]}</p>
                <ul className="divide-y divide-hair2">
                  {(byKind.get(kind) ?? []).map((a) => (
                    <AssetRow key={a.id} asset={a} />
                  ))}
                </ul>
              </div>
            ))
        )}
      </section>

      <AssetForm />

      <Link href="/relatorios" className="inline-block text-sm text-fg-muted hover:text-fg">
        Ver relatórios de despesa
      </Link>
    </div>
  );
}

function AssetRow({ asset: a }: { asset: AssetView }) {
  const isInvestment = a.kind === "investimento";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-fg">{a.name}</p>
        <p className="mt-0.5 font-mono text-[11px] text-fg-faint">
          {isInvestment ? (
            <>
              {a.quantity} un. a {formatCents(a.unitCostCents ?? 0)}
              {a.unitPriceCents !== null && a.unitPriceCents !== undefined
                ? `, hoje a ${formatCents(a.unitPriceCents)}`
                : ", sem preço atual"}
            </>
          ) : (
            a.purchasedAt ?? ""
          )}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {isInvestment ? (
          <form action={updateAssetPriceAction} className="flex items-center gap-1.5">
            <input type="hidden" name="id" value={a.id} />
            <label className="sr-only" htmlFor={`price-${a.id}`}>
              Preço atual de {a.name}
            </label>
            <input
              id={`price-${a.id}`}
              name="unitPrice"
              inputMode="decimal"
              defaultValue={
                a.unitPriceCents === null || a.unitPriceCents === undefined
                  ? ""
                  : (a.unitPriceCents / 100).toFixed(2).replace(".", ",")
              }
              placeholder="preço"
              className="input h-9 w-24 py-1 text-xs"
            />
            <button type="submit" className="btn-ghost px-2 text-xs">Atualizar</button>
          </form>
        ) : null}

        <div className="text-right">
          <p className="font-mono text-sm tnum text-fg">{formatCents(a.currentValueCents)}</p>
          {a.gainCents !== null ? (
            <p className={`font-mono text-[11px] tnum ${a.gainCents >= 0 ? "text-credit" : "text-debt"}`}>
              {a.gainCents >= 0 ? "+" : ""}
              {formatCents(a.gainCents)}
              {a.gainPct !== null ? ` (${a.gainPct >= 0 ? "+" : ""}${Math.round(a.gainPct)}%)` : ""}
            </p>
          ) : null}
        </div>

        <form action={deleteAssetAction}>
          <input type="hidden" name="id" value={a.id} />
          <button type="submit" className="btn-ghost px-2 text-xs text-debt hover:text-debt">
            Remover
          </button>
        </form>
      </div>
    </li>
  );
}
